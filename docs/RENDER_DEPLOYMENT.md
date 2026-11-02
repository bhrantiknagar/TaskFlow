# Deploy TaskFlow on Render

The root `render.yaml` defines both TaskFlow services:

- `taskflow-api`: Express web service rooted at `backend/`, started with `npm start`.
- `taskflow-frontend`: Vite static site rooted at `frontend/`, built with `npm ci && npm run build` and published from `dist`.

The frontend can be deployed on Render or another host. Configure its API origin as a build-time variable, and configure the backend CORS allowlist to match the frontend's exact public origin.

## Deploy with a Blueprint

1. Push this repository to a Git provider connected to Render.
2. In Render, choose **New → Blueprint** and select this repository.
3. When prompted, enter `MONGODB_URI` privately. Use the Atlas connection string and a database user authorized for `taskFlow`.
4. Apply the Blueprint and wait for both services to finish deploying.

Render prompts for `FRONTEND_ORIGINS`; enter the exact frontend origin (for example, your Vercel URL, without a trailing slash). Render generates `JWT_SECRET`, sets `MONGODB_DB_NAME=taskFlow`, `NODE_ENV=production`, `COOKIE_SECURE=true`, and configures `COOKIE_SAME_SITE=none` for separately hosted services. Do not copy `.env` files or secrets into the repository.

Groq is optional. To enable AI features, add `GROQ_API_KEY` and `GROQ_MODEL` to the `taskflow-api` service's environment in the Render Dashboard only.

## MongoDB Atlas and cookies

Allow the Render backend to connect to Atlas through the Atlas network access settings. The URI's database user must be able to access `taskFlow`.

The Blueprint sets `COOKIE_SAME_SITE=none` because the frontend and API use separate service origins, and enables secure cookies over HTTPS. Browser privacy settings can still restrict cross-site cookies. Using custom frontend and API domains under the same registrable domain is the most reliable option; with same-site custom domains, `COOKIE_SAME_SITE=strict` is also suitable.

Set `FRONTEND_ORIGINS` to the Vercel frontend origin when using Vercel for the frontend. If you add more frontend domains, list exact origins separated by commas. Set `VITE_API_BASE_URL` in Vercel to the Render backend's public HTTPS origin. These values contain origins only, not credentials.

## Verify

Open the backend service's `/api/health` URL; it should return `{"status":"ok"}`. Open the frontend service and register a test account. Confirm it appears in the Atlas `taskFlow.users` collection, then verify login and logout in the browser.

Render does not use the local `backend/.env`. Set production values through the Blueprint prompt or service environment settings. `frontend/.env.example` documents the optional public API origin; never put secrets there.
