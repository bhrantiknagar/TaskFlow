# Phase 4: Project Management

## Included

- Mongoose project records with a name, description, owner, members, start date, deadline, status, and timestamps.
- Authenticated project list and detail endpoints, with search and status filters.
- Project creation, editing, and deletion.
- Add existing TaskFlow users by email and remove project members.
- Project screens load and update through the API while retaining the Phase 2 layout.

## Access rules

- Admins can view and manage all projects.
- Project owners can view and manage their projects and membership.
- Project Managers can manage projects where they are members.
- Team Members can view projects where they are members.
- Other users cannot see a project. Detail requests return 404 when the user lacks access.
- The owner is set from the signed-in user and cannot be changed or removed via the API.

## API routes

All routes require the existing JWT session cookie.

- `GET /api/projects?q=term&status=Planning`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`
- `POST /api/projects/:id/members` with an existing account email
- `DELETE /api/projects/:id/members/:userId`

Project names, descriptions, status values, dates, IDs, and membership changes are validated by the API. Deadlines cannot precede start dates.

## Tests

Use a disposable MongoDB database whose name contains `test`, then set `TASKFLOW_TEST_MONGODB_URI` and run `npm test` from `backend/`. The project integration test covers CRUD, filtering, member visibility, role permissions, and validation.

## Scope boundary

Task and AI APIs, dashboard data, analytics, and notifications are not included in Phase 4.
