# TaskFlow

TaskFlow is a web-based project and task management system in development, planned to help teams organize projects, assign and track tasks, and plan work collaboratively. The current implementation includes the Phase 2 static interface and Phase 3 authentication and user profile foundation. Project and task operations and AI features remain planned.

## Planned features

- Project and team management
- Task assignment, prioritization, deadlines, and progress tracking
- Task comments and activity history
- AI Task Suggestions
- AI Task Breakdown

## Planned technology

HTML, CSS, JavaScript, Node.js, Express.js, MongoDB, JWT authentication, and Git/GitHub.

See [docs/PHASE_1.md](docs/PHASE_1.md) for the project definition and development plan, and [docs/PHASE_3.md](docs/PHASE_3.md) for authentication setup.

## Run locally

1. Install Node.js 20 or later and run MongoDB locally.
2. Copy `backend/.env.example` to `backend/.env` and set a private `JWT_SECRET` of at least 32 characters.
3. From `backend/`, run `npm install`, then `npm start`.
4. Open `http://localhost:3000`.

The Express server serves the existing frontend and API from one origin. Registration creates a Team Member account. Roles are stored on users; public registration cannot assign privileged roles. Never commit `backend/.env`.
