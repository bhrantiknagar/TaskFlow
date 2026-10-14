# TaskFlow

TaskFlow is a web-based project and task management system in development, planned to help teams organize projects, assign and track tasks, and plan work collaboratively. The current implementation includes a responsive frontend, authentication and profile management, project management, and task management. AI features remain planned.

## Features and roadmap

- Project creation, search, status filtering, and member management
- Task assignment, prioritization, deadlines, status tracking, search and filters, and subtasks
- Task comments and activity history
- AI Task Suggestions from a project description, reviewed before saving
- AI Task Breakdown for existing tasks, reviewed before adding subtasks

## Planned technology

HTML, CSS, JavaScript, Node.js, Express.js, MongoDB, JWT authentication, and Git/GitHub.

See [docs/PHASE_1.md](docs/PHASE_1.md) for the project definition and development plan, [docs/PHASE_4.md](docs/PHASE_4.md) for project management behavior, and [docs/PHASE_5.md](docs/PHASE_5.md) for task management behavior and permissions.

## Run locally

1. Install Node.js 20 or later and run MongoDB locally.
2. Copy `backend/.env.example` to `backend/.env` and set a private `JWT_SECRET` of at least 32 characters.
3. To enable AI assistance, configure `AI_PROVIDER=groq`, `GROQ_API_KEY`, and `GROQ_MODEL` in `backend/.env`. Choose a Groq model that supports strict Structured Outputs (for example, `openai/gpt-oss-120b`). The provider key remains on the backend and must be obtained from your Groq account; AI calls are unavailable until configured.
4. From `backend/`, run `npm install`, then `npm start`.
5. Open `http://localhost:3000`.

The Express server serves the existing frontend and API from one origin. Registration creates a Team Member account. Roles are stored on users; public registration cannot assign privileged roles. AI output is never saved automatically: review, edit, and select suggestions before saving them. Never commit `backend/.env`.
