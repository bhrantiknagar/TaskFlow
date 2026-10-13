const { test } = require('node:test');
const assert = require('node:assert/strict');

const testMongoUri = process.env.TASKFLOW_TEST_MONGODB_URI;
const testDbName = (() => { if (!testMongoUri) return ''; try { return new URL(testMongoUri).pathname.replace(/^\//, ''); } catch { return ''; } })();
const canRun = Boolean(testMongoUri && /(^|[_-])test([_-]|$)/i.test(testDbName));
process.env.MONGODB_URI ||= testMongoUri || 'mongodb://127.0.0.1:27017/taskflow_test_skipped';
process.env.JWT_SECRET ||= 'test-only-secret-for-task-integration-suite-at-least-32';
process.env.COOKIE_SECURE ||= 'false';

test('AI routes require authorized users and persist only explicitly approved tasks/subtasks', { skip: !canRun && 'Set TASKFLOW_TEST_MONGODB_URI to a disposable MongoDB database whose name contains "test".' }, async () => {
  const express = require('express');
  const cookieParser = require('cookie-parser');
  const mongoose = require('mongoose');
  const bcrypt = require('bcryptjs');
  const authRoutes = require('../src/routes/auth');
  const taskRoutes = require('../src/routes/tasks');
  const { createAiRouter } = require('../src/routes/ai');
  const { User } = require('../src/models/User');
  const { Project } = require('../src/models/Project');
  const { Task } = require('../src/models/Task');
  await mongoose.connect(testMongoUri);
  let calls = { suggestions: 0, breakdown: 0 };
  const provider = {
    async suggestTasks() { calls.suggestions++; return [{ title: 'Confirm scope', description: 'Review the project goals.', priority: 'Medium' }]; },
    async breakDownTask() { calls.breakdown++; return [{ title: 'List key milestones' }]; }
  };
  const app = express();
  app.use(express.json()); app.use(cookieParser());
  app.use('/api/auth', authRoutes); app.use('/api/tasks', taskRoutes); app.use('/api/ai', createAiRouter({ provider, limiter: (_req, _res, next) => next() }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const salt = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const request = (path, options = {}) => fetch(`${base}${path}`, options);
  const json = (method, body, cookie) => ({ method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const cookieFrom = response => response.headers.get('set-cookie')?.split(';', 1)[0];
  let users = [], projectId;
  try {
    const passwordHash = await bcrypt.hash('AI-test-password-1', 4);
    users = await User.insertMany([
      { name: 'AI Owner', email: `ai-owner-${salt}@example.test`, role: 'Team Member', passwordHash },
      { name: 'AI Member', email: `ai-member-${salt}@example.test`, role: 'Team Member', passwordHash },
      { name: 'AI Outsider', email: `ai-outsider-${salt}@example.test`, role: 'Team Member', passwordHash }
    ]);
    const login = async user => { const response = await request('/api/auth/login', json('POST', { email: user.email, password: 'AI-test-password-1' })); assert.equal(response.status, 200); return cookieFrom(response); };
    const [ownerCookie, memberCookie, outsiderCookie] = await Promise.all(users.map(login));
    let response = await request('/api/ai/suggestions', json('POST', { projectId: 'not-an-id' }, ownerCookie));
    assert.equal(response.status, 400, 'invalid project ids are rejected');
    response = await request('/api/ai/suggestions', json('POST', { projectId: String(new mongoose.Types.ObjectId()) }));
    assert.equal(response.status, 401, 'AI endpoints require authentication');
    const project = await Project.create({ name: 'AI project', description: 'Prepare a public launch for our new app.', owner: users[0]._id, members: [users[1]._id] });
    projectId = String(project._id);
    const task = await Task.create({ title: 'Plan launch', description: 'Prepare coordinated launch work.', project: project._id, createdBy: users[0]._id });
    response = await request('/api/ai/suggestions', json('POST', { projectId }, outsiderCookie));
    assert.equal(response.status, 404, 'outsiders cannot read project context');
    response = await request('/api/ai/suggestions', json('POST', { projectId }, memberCookie));
    assert.equal(response.status, 403, 'members without management rights cannot generate saveable tasks');
    response = await request('/api/ai/breakdown', json('POST', { taskId: String(task._id) }, memberCookie));
    assert.equal(response.status, 403, 'members without management rights cannot generate subtasks');
    response = await request('/api/ai/suggestions', json('POST', { projectId }, ownerCookie));
    assert.equal(response.status, 200);
    const generated = await response.json();
    assert.equal(generated.suggestions[0].title, 'Confirm scope');
    assert.equal(await Task.countDocuments({ project: project._id }), 1, 'generation alone does not persist tasks');
    response = await request('/api/ai/breakdown', json('POST', { taskId: String(task._id) }, ownerCookie));
    assert.deepEqual((await response.json()).subtasks, [{ title: 'List key milestones' }]);
    assert.equal((await Task.findById(task._id)).subtasks.length, 0, 'generation alone does not persist subtasks');
    assert.deepEqual(calls, { suggestions: 1, breakdown: 1 });

    response = await request('/api/tasks', json('POST', { project: projectId, title: generated.suggestions[0].title, description: generated.suggestions[0].description, priority: generated.suggestions[0].priority }, ownerCookie));
    assert.equal(response.status, 201, 'only an explicit approved task save creates a MongoDB task');
    response = await request(`/api/tasks/${task._id}/subtasks`, json('POST', { title: 'List key milestones' }, ownerCookie));
    assert.equal(response.status, 201, 'only an explicit approved subtask save updates MongoDB');
    assert.equal(await Task.countDocuments({ project: project._id }), 2);
    assert.equal((await Task.findById(task._id)).subtasks.length, 1);
  } finally {
    if (projectId) { await Task.deleteMany({ project: projectId }); await Project.deleteOne({ _id: projectId }); }
    if (users.length) { const ids = users.map(user => user._id); await Task.deleteMany({ project: { $in: ids } }); await Task.deleteMany({ createdBy: { $in: ids } }); await Project.deleteMany({ owner: { $in: ids } }); await User.deleteMany({ _id: { $in: ids } }); }
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
});
