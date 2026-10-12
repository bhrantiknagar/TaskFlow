const { test } = require('node:test');
const assert = require('node:assert/strict');

const testMongoUri = process.env.TASKFLOW_TEST_MONGODB_URI;
const testDbName = (() => {
  if (!testMongoUri) return '';
  try { return new URL(testMongoUri).pathname.replace(/^\//, ''); } catch { return ''; }
})();
const canRun = Boolean(testMongoUri && /(^|[_-])test([_-]|$)/i.test(testDbName));
process.env.MONGODB_URI ||= testMongoUri || 'mongodb://127.0.0.1:27017/taskflow_test_skipped';
process.env.JWT_SECRET ||= 'test-only-secret-for-dashboard-integration-suite-at-least-32';
process.env.COOKIE_SECURE ||= 'false';

test('dashboard returns user-scoped statistics, progress, task groups, deadlines and validated filters', { skip: !canRun && 'Set TASKFLOW_TEST_MONGODB_URI to a disposable MongoDB database whose name contains "test".' }, async () => {
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
  let users = [], projects = [];
  const request = (path, options = {}) => fetch(`${base}${path}`, options);
  const json = (method, body, cookie) => ({ method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const cookieFrom = response => response.headers.get('set-cookie')?.split(';', 1)[0];
  try {
    const passwordHash = await bcrypt.hash('Dashboard-test-password-1', 4);
    users = await User.insertMany([
      { name: 'Dashboard Owner', email: `dashboard-${salt}@example.test`, passwordHash },
      { name: 'Private Owner', email: `private-${salt}@example.test`, passwordHash }
    ]);
    const loginResponse = await request('/api/auth/login', json('POST', { email: users[0].email, password: 'Dashboard-test-password-1' }));
    assert.equal(loginResponse.status, 200);
    const cookie = cookieFrom(loginResponse);

    const today = new Date();
    const dateOnly = offset => {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
      return date;
    };
    projects = await Project.insertMany([
      { name: `Dashboard project ${salt}`, owner: users[0]._id, status: 'In progress' },
      { name: `Hidden project ${salt}`, owner: users[1]._id, status: 'Planning' }
    ]);
    await Task.insertMany([
      { title: 'Overdue task', project: projects[0]._id, createdBy: users[0]._id, status: 'To Do', dueDate: dateOnly(-1) },
      { title: 'Upcoming task', project: projects[0]._id, createdBy: users[0]._id, status: 'In Progress', dueDate: dateOnly(2), assignee: users[0]._id },
      { title: 'Finished task', project: projects[0]._id, createdBy: users[0]._id, status: 'Completed', dueDate: dateOnly(3) },
      { title: 'Unscheduled task', project: projects[0]._id, createdBy: users[0]._id, status: 'To Do' },
      { title: 'Private task', project: projects[1]._id, createdBy: users[1]._id, status: 'Completed' }
    ]);

    let response = await request('/api/dashboard');
    assert.equal(response.status, 401, 'dashboard requires authentication');
    response = await request('/api/dashboard?range=unknown', { headers: { Cookie: cookie } });
    assert.equal(response.status, 400, 'invalid range is rejected');
    response = await request('/api/dashboard?project=bad-id', { headers: { Cookie: cookie } });
    assert.equal(response.status, 400, 'invalid project id is rejected');
    response = await request(`/api/dashboard?project=${projects[1]._id}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 404, 'user cannot filter to another users project');

    response = await request('/api/dashboard?range=all', { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    let dashboard = await response.json();
    assert.equal(dashboard.stats.totalProjects, 1, 'other users projects are hidden');
    assert.equal(dashboard.stats.totalTasks, 4);
    assert.equal(dashboard.stats.completedTasks, 1);
    assert.equal(dashboard.stats.pendingTasks, 3);
    assert.equal(dashboard.projects[0].taskCount, 4);
    assert.equal(dashboard.projects[0].completedTaskCount, 1);
    assert.equal(dashboard.projects[0].progress, 25);
    assert.equal(dashboard.taskGroups['To Do'].count, 2);
    assert.equal(dashboard.taskGroups['In Progress'].count, 1);
    assert.equal(dashboard.taskGroups.Completed.count, 1);
    assert.equal(dashboard.upcomingTasks.length, 3, 'all date filter lists dates but omits undated tasks');
    assert.equal(dashboard.assignedTaskCount, 1);
    assert.deepEqual(dashboard.recentActivity, [], 'no synthetic activity is returned');

    response = await request('/api/dashboard', { headers: { Cookie: cookie } });
    dashboard = await response.json();
    assert.ok(dashboard.upcomingTasks.some(task => task.title === 'Overdue task'), 'default week range includes open overdue tasks');
    response = await request('/api/dashboard?range=overdue', { headers: { Cookie: cookie } });
    dashboard = await response.json();
    assert.equal(dashboard.upcomingTasks.length, 1);
    assert.equal(dashboard.upcomingTasks[0].title, 'Overdue task');
    response = await request(`/api/dashboard?project=${projects[0]._id}&range=all`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200, 'accessible project filter is accepted');
    assert.equal((await response.json()).stats.totalProjects, 1);

    const emptyProject = await Project.create({ name: `Empty dashboard project ${salt}`, owner: users[0]._id, status: 'Planning' });
    projects.push(emptyProject);
    response = await request(`/api/dashboard?project=${emptyProject.id}&range=all`, { headers: { Cookie: cookie } });
    dashboard = await response.json();
    assert.equal(dashboard.stats.totalTasks, 0, 'empty projects return zero task totals');
    assert.equal(dashboard.projects[0].progress, 0, 'empty projects have zero progress');
    assert.deepEqual(Object.values(dashboard.taskGroups).map(group => group.count), [0, 0, 0], 'empty task groups have zero counts');
    assert.deepEqual(dashboard.upcomingTasks, [], 'empty projects have no deadlines');
  } finally {
    if (projects.length) await Task.deleteMany({ project: { $in: projects.map(project => project._id) } });
    if (projects.length) await Project.deleteMany({ _id: { $in: projects.map(project => project._id) } });
    if (users.length) await User.deleteMany({ _id: { $in: users.map(user => user._id) } });
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
});
