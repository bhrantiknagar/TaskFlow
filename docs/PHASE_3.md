# Phase 3: Authentication & User Management

## Included

- Express authentication service with a Mongoose user model.
- User registration with name, email, and password validation.
- Case-insensitive email lookup and duplicate-email handling.
- Password hashes stored with bcrypt; plaintext passwords are not stored or returned.
- JWT sessions in HttpOnly, SameSite=Strict cookies.
- Session revocation on logout using a per-user token version.
- Protected application pages and `/api/auth/me` profile access.
- Roles: Admin, Project Manager, and Team Member. Public registration always assigns Team Member.
- Basic editable profile fields: name, job title, and bio. Email and role are read-only in the profile UI.
- Rate limits for registration and login, generic invalid-credential responses, and request validation.
- Existing login, registration, and profile screens call the API without a visual redesign.

## Run

From `backend/`, install dependencies, copy `.env.example` to `.env`, configure `MONGODB_URI` and a private `JWT_SECRET` (minimum 32 characters), and run `npm start`. The Express service also serves `frontend/` at the same origin.

## Integration test

The auth integration test uses a disposable MongoDB database whose name contains `test`. Set `TASKFLOW_TEST_MONGODB_URI`, for example `mongodb://127.0.0.1:27017/taskflow_phase3_test`, then run `npm test` from `backend/`. The test removes its created account when finished. Without that environment variable, the test is skipped.

## Scope boundary

Project/task APIs, persistent dashboard data, and AI services are not included in Phase 3. Existing sample UI content remains demonstration data.
