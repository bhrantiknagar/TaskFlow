const { test } = require('node:test');
const assert = require('node:assert/strict');

const testMongoUri = process.env.TASKFLOW_TEST_MONGODB_URI;
const testDbName = (() => {
  if (!testMongoUri) return '';
  try { return new URL(testMongoUri).pathname.replace(/^\//, ''); } catch { return ''; }
})();
const canRun = Boolean(testMongoUri && /(^|[_-])test([_-]|$)/i.test(testDbName));
process.env.MONGODB_URI ||= testMongoUri || 'mongodb://127.0.0.1:27017/taskflow_test_skipped';
process.env.JWT_SECRET ||= 'test-only-secret-for-auth-integration-suite-at-least-32';
process.env.COOKIE_SECURE ||= 'false';

test('registration, login, logout, validation, duplicates, profile, and protected access', { skip: !canRun && 'Set TASKFLOW_TEST_MONGODB_URI to a disposable MongoDB database whose name contains "test".' }, async () => {
  const mongoose = require('mongoose');
  const app = require('../src/app');
  const { User } = require('../src/models/User');
  await mongoose.connect(testMongoUri);
  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const email = `phase3-${Date.now()}@example.test`;
  const request = (path, options = {}) => fetch(`${base}${path}`, options);
  const json = (method, body, cookie) => ({ method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const cookieFrom = response => response.headers.get('set-cookie')?.split(';', 1)[0];

  try {
    let response = await request('/api/auth/me');
    assert.equal(response.status, 401, 'protected profile rejects anonymous users');
    response = await request('/dashboard');
    assert.equal(response.status, 401, 'protected application page rejects anonymous users');

    response = await request('/api/auth/register', json('POST', { name: 'T', email, password: 'short' }));
    assert.equal(response.status, 400, 'registration validates name and password');

    response = await request('/api/auth/register', json('POST', { name: 'Test Member', email, password: 'Sufficient-test-password-1', role: 'Admin' }));
    assert.equal(response.status, 201, 'valid registration succeeds');
    let result = await response.json();
    assert.equal(result.user.role, 'Team Member', 'public registration cannot choose a privileged role');
    assert.ok(!('passwordHash' in result.user), 'password hash is never returned');
    const registeredCookie = cookieFrom(response);
    assert.ok(registeredCookie, 'registration sets an authentication cookie');
    assert.match(response.headers.get('set-cookie'), /HttpOnly/i, 'session cookie is HttpOnly');

    response = await request('/api/auth/me', { headers: { Cookie: registeredCookie } });
    assert.equal(response.status, 200, 'valid session can access protected profile');
    result = await response.json();
    assert.equal(result.user.email, email);
    response = await request('/dashboard', { headers: { Cookie: registeredCookie } });
    assert.equal(response.status, 200, 'authenticated users can load a protected application page');

    response = await request('/api/auth/register', json('POST', { name: 'Duplicate', email: email.toUpperCase(), password: 'Sufficient-test-password-1' }));
    assert.equal(response.status, 409, 'duplicate email is rejected case-insensitively');

    response = await request('/api/auth/login', json('POST', { email, password: 'incorrect-password' }));
    assert.equal(response.status, 401, 'invalid credentials are rejected');

    response = await request('/api/auth/login', json('POST', { email: email.toUpperCase(), password: 'Sufficient-test-password-1' }));
    assert.equal(response.status, 200, 'valid login succeeds');
    const loginCookie = cookieFrom(response);
    assert.ok(loginCookie, 'login sets an authentication cookie');

    response = await request('/api/auth/me', json('PATCH', { name: 'Taylor Member', jobTitle: 'Designer', bio: 'Working on TaskFlow.' }, loginCookie));
    assert.equal(response.status, 200, 'profile can be updated');
    result = await response.json();
    assert.equal(result.user.name, 'Taylor Member');
    assert.equal(result.user.jobTitle, 'Designer');
    assert.equal(result.user.role, 'Team Member');

    response = await request('/api/auth/logout', { method: 'POST', headers: { Cookie: loginCookie } });
    assert.equal(response.status, 200, 'logout succeeds');
    assert.match(response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i, 'logout expires the session cookie');
    response = await request('/api/auth/me', { headers: { Cookie: loginCookie } });
    assert.equal(response.status, 401, 'logout revokes the session token');
    response = await request('/api/auth/login', json('POST', { email, password: 'Sufficient-test-password-1' }));
    assert.equal(response.status, 200, 'user can sign in again after logout');
    const renewedCookie = cookieFrom(response);
    response = await request('/api/auth/me', { headers: { Cookie: renewedCookie } });
    assert.equal(response.status, 200, 'new session uses the updated token version');
  } finally {
    await User.deleteOne({ email });
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
});
