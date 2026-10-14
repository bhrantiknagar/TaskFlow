# TaskFlow

TaskFlow is a web-based project and task management system for organizing projects, assigning work, and tracking team progress. The frontend is being migrated to React with Vite; the existing UI, backend API, and MongoDB data model are retained during the migration.

## Features and roadmap

- Project creation, search, status filtering, and member management
- Task assignment, prioritization, deadlines, status tracking, search and filters, and subtasks
- Task comments and activity history
- AI Task Suggestions from a project description, reviewed before saving
- AI Task Breakdown for existing tasks, reviewed before adding subtasks

## Technology

React, HTML, CSS, JavaScript, Vite, Node.js, Express.js, MongoDB, JWT authentication, and Git/GitHub.

See [docs/PHASE_1.md](docs/PHASE_1.md) for the project definition and development plan, [docs/PHASE_4.md](docs/PHASE_4.md) for project management behavior, and [docs/PHASE_5.md](docs/PHASE_5.md) for task management behavior and permissions.

## Run locally

1. Install Node.js 20 or later and run MongoDB locally.
2. Copy `backend/.env.example` to `backend/.env` and set a private `JWT_SECRET` of at least 32 characters.
3. To enable AI assistance, configure `AI_PROVIDER=groq`, `GROQ_API_KEY`, and `GROQ_MODEL` in `backend/.env`. Choose a Groq model that supports strict Structured Outputs (for example, `openai/gpt-oss-120b`). The provider key remains on the backend; AI calls are unavailable until configured.
4. In `backend/`, run `npm install` and then `npm start`.
5. In a second terminal, run `npm install` and `npm run dev` from `frontend/`.
6. Open the Vite URL shown in the frontend terminal (normally `http://127.0.0.1:5173`).

For a single-server build, run `npm run build` from `frontend/`, then open `http://localhost:3000`. Express serves the generated React app from `frontend/dist` when the build exists.

Registration creates a Team Member account. Roles are stored on users; public registration cannot assign privileged roles. AI output is never saved automatically: review, edit, and select suggestions before saving them. Never commit `backend/.env`.
