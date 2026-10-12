const { test } = require('node:test');
const assert = require('node:assert/strict');

const testMongoUri = process.env.TASKFLOW_TEST_MONGODB_URI;
const testDbName = (() => { if (!testMongoUri) return ''; try { return new URL(testMongoUri).pathname.replace(/^\//, ''); } catch { return ''; } })();
const canRun = Boolean(testMongoUri && /(^|[_-])test([_-]|$)/i.test(testDbName));
process.env.MONGODB_URI ||= testMongoUri || 'mongodb://127.0.0.1:27017/taskflow_test_skipped';
process.env.JWT_SECRET ||= 'test-only-secret-for-task-integration-suite-at-least-32';
process.env.COOKIE_SECURE ||= 'false';

test('task CRUD, filters, assignments, permissions, and subtasks', { skip: !canRun && 'Set TASKFLOW_TEST_MONGODB_URI to a disposable MongoDB database whose name contains "test".' }, async () => {
  const mongoose = require('mongoose');
  const bcrypt = require('bcryptjs');
  const app = require('../src/app');
  const { User } = require('../src/models/User');
  const { Project } = require('../src/models/Project');
  const { Task } = require('../src/models/Task');
  await mongoose.connect(testMongoUri);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const salt = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let users = [];
  let projectId;
  const request = (path, options = {}) => fetch(`${base}${path}`, options);
  const json = (method, body, cookie) => ({ method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const cookieFrom = response => response.headers.get('set-cookie')?.split(';', 1)[0];
  const login = async user => {
    const response = await request('/api/auth/login', json('POST', { email: user.email, password: 'Task-test-password-1' }));
    assert.equal(response.status, 200);
    return cookieFrom(response);
  };

  try {
    const passwordHash = await bcrypt.hash('Task-test-password-1', 4);
    users = await User.insertMany([
      { name: 'Task Owner', email: `task-owner-${salt}@example.test`, role: 'Team Member', passwordHash },
      { name: 'Task Member', email: `task-member-${salt}@example.test`, role: 'Team Member', passwordHash },
      { name: 'Task Manager', email: `task-manager-${salt}@example.test`, role: 'Project Manager', passwordHash },
      { name: 'Task Outsider', email: `task-outsider-${salt}@example.test`, role: 'Team Member', passwordHash },
      { name: 'Task Admin', email: `task-admin-${salt}@example.test`, role: 'Admin', passwordHash }
    ]);
    const [ownerCookie, memberCookie, managerCookie, outsiderCookie, adminCookie] = await Promise.all(users.map(login));
    let response = await request('/api/tasks');
    assert.equal(response.status, 401, 'task routes require authentication');
    response = await request('/api/projects', json('POST', { name: `Task test project ${salt}` }, ownerCookie));
    assert.equal(response.status, 201);
    projectId = (await response.json()).project.id;
    for (const member of [users[1], users[2]]) {
      response = await request(`/api/projects/${projectId}/members`, json('POST', { email: member.email }, ownerCookie));
      assert.equal(response.status, 201);
    }

    response = await request('/api/tasks', json('POST', { title: 'No project' }, ownerCookie));
    assert.equal(response.status, 400, 'project is required');
    response = await request('/api/tasks', json('POST', { title: 'Invalid assignee', project: projectId, assignee: String(users[3]._id) }, ownerCookie));
    assert.equal(response.status, 400, 'assignee must belong to project');
    response = await request('/api/tasks', json('POST', { title: 'Created by member', project: projectId }, memberCookie));
    assert.equal(response.status, 403, 'regular project member cannot create tasks');

    response = await request('/api/tasks', json('POST', {
      title: 'Write launch brief', description: 'Prepare the short product launch brief.', project: projectId,
      assignee: String(users[1]._id), priority: 'High', status: 'To Do', dueDate: '2026-11-15',
      subtasks: [{ title: 'Collect product details' }, { title: 'Draft the brief', completed: false }]
    }, ownerCookie));
    assert.equal(response.status, 201, 'project owner creates task with subtask list');
    let task = (await response.json()).task;
    const taskId = task.id;
    assert.equal(task.assignee.id, String(users[1]._id));
    assert.equal(task.subtasks.length, 2);
    assert.equal(task.canManage, true);

    response = await request(`/api/tasks/${taskId}`, { headers: { Cookie: memberCookie } });
    assert.equal(response.status, 200, 'member may view project task');
    response = await request(`/api/tasks/${taskId}`, { headers: { Cookie: outsiderCookie } });
    assert.equal(response.status, 404, 'outsider cannot view task');
    response = await request(`/api/tasks/${taskId}`, json('PATCH', { title: 'Member edit' }, memberCookie));
    assert.equal(response.status, 403, 'non-assignee member cannot edit task');
    response = await request(`/api/tasks/${taskId}`, json('PATCH', { title: 'Assignee edit' }, memberCookie));
    assert.equal(response.status, 403, 'assignee cannot edit task fields');
    response = await request(`/api/tasks/${taskId}`, json('PATCH', { status: 'In Progress' }, memberCookie));
    assert.equal(response.status, 200, 'assignee may update status');
    assert.equal((await response.json()).task.status, 'In Progress');
    response = await request(`/api/tasks/${taskId}/subtasks/${task.subtasks[0].id}`, json('PATCH', { completed: true }, memberCookie));
    assert.equal(response.status, 200, 'assignee may complete a subtask');
    assert.equal((await response.json()).task.subtasks[0].completed, true);
    response = await request(`/api/tasks/${taskId}/subtasks`, json('POST', { title: 'Member-added subtask' }, memberCookie));
    assert.equal(response.status, 403, 'assignee cannot add subtasks');

    response = await request(`/api/tasks/${taskId}`, json('PATCH', { title: 'Manager revision', priority: 'Low', status: 'Completed', description: 'Updated description.' }, managerCookie));
    assert.equal(response.status, 200, 'project manager member may edit task');
    task = (await response.json()).task;
    assert.equal(task.title, 'Manager revision');
    assert.equal(task.priority, 'Low');
    response = await request(`/api/tasks/${taskId}`, json('PATCH', { dueDate: '2026-02-31' }, ownerCookie));
    assert.equal(response.status, 400, 'invalid due dates are rejected');
    response = await request(`/api/tasks/${taskId}`, json('PATCH', { priority: 'Urgent' }, ownerCookie));
    assert.equal(response.status, 400, 'invalid task priority is rejected');
    response = await request(`/api/tasks/${taskId}`, json('PATCH', { assignee: String(users[3]._id) }, managerCookie));
    assert.equal(response.status, 400, 'manager cannot assign a nonmember');
    response = await request(`/api/tasks/${taskId}`, json('PATCH', { assignee: String(users[0]._id) }, managerCookie));
    assert.equal(response.status, 200, 'manager can assign a project participant');
    response = await request(`/api/tasks/${taskId}`, json('PATCH', { assignee: String(users[1]._id) }, managerCookie));
    assert.equal(response.status, 200, 'manager can reassign the task to a project member');

    response = await request(`/api/tasks/${taskId}/subtasks`, json('POST', { title: 'Review the draft' }, ownerCookie));
    assert.equal(response.status, 201, 'manager can add a subtask');
    task = (await response.json()).task;
    const addedSubtaskId = task.subtasks[2].id;
    response = await request(`/api/tasks/${taskId}/subtasks/${addedSubtaskId}`, json('PATCH', { title: 'Review the final draft' }, ownerCookie));
    assert.equal(response.status, 200, 'manager can rename a subtask');
    response = await request(`/api/tasks/${taskId}/subtasks/${addedSubtaskId}`, { method: 'DELETE', headers: { Cookie: ownerCookie } });
    assert.equal(response.status, 200, 'manager can remove a subtask');

    response = await request(`/api/tasks?q=manager&status=Completed&priority=Low&project=${projectId}&assignee=${users[1]._id}`, { headers: { Cookie: ownerCookie } });
    assert.equal(response.status, 200, 'task filter combination is accepted');
    assert.equal((await response.json()).tasks.length, 1);
    response = await request(`/api/tasks?assignee=unassigned&project=${projectId}`, { headers: { Cookie: ownerCookie } });
    assert.equal((await response.json()).tasks.length, 0, 'unassigned filter works');
    response = await request('/api/tasks?status=unknown', { headers: { Cookie: ownerCookie } });
    assert.equal(response.status, 400, 'invalid filter is rejected');
    response = await request(`/api/tasks?project=${projectId}`, { headers: { Cookie: outsiderCookie } });
    assert.equal(response.status, 404, 'outsider cannot filter into a hidden project');

    response = await request(`/api/tasks/${taskId}`, { method: 'DELETE', headers: { Cookie: memberCookie } });
    assert.equal(response.status, 403, 'member cannot delete task');
    response = await request(`/api/tasks/${taskId}`, { method: 'DELETE', headers: { Cookie: ownerCookie } });
    assert.equal(response.status, 200, 'owner can delete task');
    response = await request(`/api/tasks/${taskId}`, { headers: { Cookie: ownerCookie } });
    assert.equal(response.status, 404, 'deleted task is inaccessible');

    response = await request('/api/tasks', json('POST', { title: 'Admin task', project: projectId }, adminCookie));
    assert.equal(response.status, 201, 'Admin can create tasks in a project');
    const adminTaskId = (await response.json()).task.id;
    response = await request(`/api/projects/${projectId}`, { method: 'DELETE', headers: { Cookie: adminCookie } });
    assert.equal(response.status, 200, 'Admin can delete the project');
    response = await request(`/api/tasks/${adminTaskId}`, { headers: { Cookie: adminCookie } });
    assert.equal(response.status, 404, 'deleting a project removes its tasks');
  } finally {
    if (projectId) await Project.deleteOne({ _id: projectId });
    if (users.length) {
      const ids = users.map(user => user._id);
      await Task.deleteMany({ $or: [{ createdBy: { $in: ids } }, { assignee: { $in: ids } }] });
      await Project.deleteMany({ $or: [{ owner: { $in: ids } }, { members: { $in: ids } }] });
      await User.deleteMany({ _id: { $in: ids } });
    }
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
});
