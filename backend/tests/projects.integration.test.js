const { test } = require('node:test');
const assert = require('node:assert/strict');

const testMongoUri = process.env.TASKFLOW_TEST_MONGODB_URI;
const testDbName = (() => {
  if (!testMongoUri) return '';
  try { return new URL(testMongoUri).pathname.replace(/^\//, ''); } catch { return ''; }
})();
const canRun = Boolean(testMongoUri && /(^|[_-])test([_-]|$)/i.test(testDbName));
process.env.MONGODB_URI ||= testMongoUri || 'mongodb://127.0.0.1:27017/taskflow_test_skipped';
process.env.JWT_SECRET ||= 'test-only-secret-for-project-integration-suite-at-least-32';
process.env.COOKIE_SECURE ||= 'false';

test('project CRUD, member management, visibility, permissions, validation, and filters', { skip: !canRun && 'Set TASKFLOW_TEST_MONGODB_URI to a disposable MongoDB database whose name contains "test".' }, async () => {
  const mongoose = require('mongoose');
  const bcrypt = require('bcryptjs');
  const app = require('../src/app');
  const { User } = require('../src/models/User');
  const { Project } = require('../src/models/Project');
  await mongoose.connect(testMongoUri);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const salt = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const testUsers = [
    { name: 'Project Owner', email: `owner-${salt}@example.test`, role: 'Team Member' },
    { name: 'Project Member', email: `member-${salt}@example.test`, role: 'Team Member' },
    { name: 'Project Manager', email: `manager-${salt}@example.test`, role: 'Project Manager' },
    { name: 'Outside User', email: `outside-${salt}@example.test`, role: 'Team Member' },
    { name: 'Workspace Admin', email: `admin-${salt}@example.test`, role: 'Admin' }
  ];
  let users = [];
  const request = (path, options = {}) => fetch(`${base}${path}`, options);
  const json = (method, body, cookie) => ({ method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const cookieFrom = response => response.headers.get('set-cookie')?.split(';', 1)[0];
  const login = async user => {
    const response = await request('/api/auth/login', json('POST', { email: user.email, password: 'Project-test-password-1' }));
    assert.equal(response.status, 200, `test login for ${user.role}`);
    return cookieFrom(response);
  };

  try {
    const passwordHash = await bcrypt.hash('Project-test-password-1', 4);
    users = await User.insertMany(testUsers.map(user => ({ ...user, passwordHash })));
    const [ownerCookie, memberCookie, managerCookie, outsiderCookie, adminCookie] = await Promise.all(users.map(login));

    let response = await request('/api/projects');
    assert.equal(response.status, 401, 'project routes require authentication');
    response = await request('/api/projects', json('POST', { name: 'A project' }));
    assert.equal(response.status, 401, 'project creation requires authentication');

    response = await request('/api/projects', json('POST', { description: 'Missing name' }, ownerCookie));
    assert.equal(response.status, 400, 'project name is required');
    response = await request('/api/projects', json('POST', { name: 'Invalid Dates', startDate: '2026-10-10', deadline: '2026-10-09' }, ownerCookie));
    assert.equal(response.status, 400, 'deadline cannot precede start date');
    response = await request('/api/projects', json('POST', { name: 'Owner Spoof', owner: String(users[4]._id) }, ownerCookie));
    assert.equal(response.status, 400, 'clients cannot set the project owner');

    response = await request('/api/projects', json('POST', {
      name: 'Website Refresh', description: 'Redesign the public site.', startDate: '2026-10-10', deadline: '2026-11-01', status: 'Planning'
    }, ownerCookie));
    assert.equal(response.status, 201, 'authenticated user creates a project');
    let result = await response.json();
    let project = result.project;
    assert.equal(project.owner.id, String(users[0]._id), 'creator becomes owner');
    assert.equal(project.members.length, 0);
    assert.equal(project.canManage, true);
    const projectId = project.id;

    response = await request('/api/projects', { headers: { Cookie: ownerCookie } });
    assert.equal(response.status, 200, 'owner can list projects');
    result = await response.json();
    assert.ok(result.projects.some(item => item.id === projectId));
    response = await request('/api/projects', { headers: { Cookie: outsiderCookie } });
    assert.deepEqual((await response.json()).projects, [], 'nonmembers do not see a project in their list');
    response = await request(`/api/projects/${projectId}`, { headers: { Cookie: outsiderCookie } });
    assert.equal(response.status, 404, 'nonmembers cannot view project details');
    response = await request(`/api/projects/not-an-id`, { headers: { Cookie: ownerCookie } });
    assert.equal(response.status, 400, 'malformed project ids are rejected');

    response = await request(`/api/projects/${projectId}/members`, json('POST', { email: 'not-an-email' }, ownerCookie));
    assert.equal(response.status, 400, 'member email is validated');
    response = await request(`/api/projects/${projectId}/members`, json('POST', { email: 'missing@example.test' }, ownerCookie));
    assert.equal(response.status, 404, 'member must already have a TaskFlow account');
    response = await request(`/api/projects/${projectId}/members`, json('POST', { email: users[1].email }, ownerCookie));
    assert.equal(response.status, 201, 'owner can add a project member');
    project = (await response.json()).project;
    assert.equal(project.members.length, 1);
    response = await request(`/api/projects/${projectId}/members`, json('POST', { email: users[1].email.toUpperCase() }, ownerCookie));
    assert.equal(response.status, 409, 'duplicate membership is rejected');

    response = await request(`/api/projects/${projectId}`, { headers: { Cookie: memberCookie } });
    assert.equal(response.status, 200, 'member can open project details');
    project = (await response.json()).project;
    assert.equal(project.canManage, false, 'team member has view-only permissions');
    response = await request(`/api/projects/${projectId}`, json('PATCH', { description: 'Member cannot edit.' }, memberCookie));
    assert.equal(response.status, 403, 'team member cannot edit a project');
    response = await request(`/api/projects/${projectId}`, { method: 'DELETE', headers: { Cookie: memberCookie } });
    assert.equal(response.status, 403, 'team member cannot delete a project');

    response = await request(`/api/projects/${projectId}/members`, json('POST', { email: users[2].email }, ownerCookie));
    assert.equal(response.status, 201, 'owner can add a project manager');
    response = await request(`/api/projects/${projectId}`, json('PATCH', { status: 'In progress' }, managerCookie));
    assert.equal(response.status, 200, 'project manager who is a member can edit project');
    project = (await response.json()).project;
    assert.equal(project.status, 'In progress');
    assert.equal(project.canManage, true);

    response = await request(`/api/projects/${projectId}`, json('PATCH', { owner: String(users[4]._id) }, ownerCookie));
    assert.equal(response.status, 400, 'owner cannot be changed through project edits');
    response = await request(`/api/projects/${projectId}`, json('PATCH', { startDate: '2026-12-01' }, ownerCookie));
    assert.equal(response.status, 400, 'edits that make dates invalid are rejected');
    response = await request(`/api/projects/${projectId}`, json('PATCH', { description: 'Updated by owner.', deadline: '2026-11-05' }, ownerCookie));
    assert.equal(response.status, 200, 'owner can edit project details');
    project = (await response.json()).project;
    assert.equal(project.description, 'Updated by owner.');
    assert.equal(new Date(project.deadline).toISOString().slice(0, 10), '2026-11-05');

    response = await request(`/api/projects/${projectId}/members/${users[0]._id}`, { method: 'DELETE', headers: { Cookie: ownerCookie } });
    assert.equal(response.status, 409, 'owner cannot be removed as a member');
    response = await request(`/api/projects/${projectId}/members/${users[1]._id}`, { method: 'DELETE', headers: { Cookie: outsiderCookie } });
    assert.equal(response.status, 403, 'nonmembers cannot change project membership');
    response = await request(`/api/projects/${projectId}/members/${users[1]._id}`, { method: 'DELETE', headers: { Cookie: ownerCookie } });
    assert.equal(response.status, 200, 'owner can remove a member');
    response = await request(`/api/projects/${projectId}`, { headers: { Cookie: memberCookie } });
    assert.equal(response.status, 404, 'removed member loses project access');

    response = await request('/api/projects', json('POST', { name: 'Launch Checklist', status: 'Completed' }, ownerCookie));
    assert.equal(response.status, 201, 'second project can be created');
    response = await request('/api/projects?q=launch&status=Completed', { headers: { Cookie: ownerCookie } });
    assert.equal(response.status, 200, 'search and status filters are accepted');
    result = await response.json();
    assert.equal(result.projects.length, 1);
    assert.equal(result.projects[0].name, 'Launch Checklist');
    response = await request('/api/projects?status=unknown', { headers: { Cookie: ownerCookie } });
    assert.equal(response.status, 400, 'invalid status filter is rejected');

    response = await request('/api/projects', { headers: { Cookie: adminCookie } });
    assert.equal(response.status, 200, 'Admin can list workspace projects');
    response = await request(`/api/projects/${projectId}`, { headers: { Cookie: adminCookie } });
    assert.equal(response.status, 200, 'Admin can access project details');
    response = await request(`/api/projects/${projectId}`, json('PATCH', { status: 'On hold' }, adminCookie));
    assert.equal(response.status, 200, 'Admin can edit any project');
    response = await request(`/api/projects/${projectId}`, { method: 'DELETE', headers: { Cookie: adminCookie } });
    assert.equal(response.status, 200, 'Admin can delete any project');
    response = await request(`/api/projects/${projectId}`, { headers: { Cookie: ownerCookie } });
    assert.equal(response.status, 404, 'deleted project is no longer accessible');
  } finally {
    if (users.length) {
      const userIds = users.map(user => user._id);
      await Project.deleteMany({ $or: [{ owner: { $in: userIds } }, { members: { $in: userIds } }] });
      await User.deleteMany({ _id: { $in: userIds } });
    }
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
});
