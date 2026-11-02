# Deploy TaskFlow to Vercel

The repository is configured as one Vercel project: Vite builds the frontend to `frontend/dist`, and `/api/*` is handled by the Express serverless function in `api/[...path].js`. Both use the same Vercel domain, so the existing browser code calls `/api` on that domain.

## Vercel project settings

Import the repository in Vercel and use the repository root as the **Root Directory**. Keep **Include source files outside of the Root Directory** enabled if the project settings show that option. The checked-in `vercel.json` supplies the build command and output directory.

## Required environment variables

Set these in Vercel Project Settings → Environment Variables for **Production** (and Preview if you want preview deployments to work):

- `MONGODB_URI`: a MongoDB Atlas connection string for a database you control. A local value such as `mongodb://localhost:27017/...` cannot be reached by Vercel.
- `MONGODB_DB_NAME`: database name, normally `taskFlow` (the application defaults to this if omitted).
- `JWT_SECRET`: a private random value of at least 32 characters. Use a different value from local development.
- `NODE_ENV`: `production`.
- `COOKIE_SECURE`: `true`.

Set `GROQ_API_KEY` and `GROQ_MODEL` only if you want AI assistance enabled. The key belongs only in the backend environment settings. `AI_PROVIDER=groq` is already the application default; it can also be set explicitly.

If the browser frontend and API are ever hosted on separate origins, set `FRONTEND_ORIGINS` to the exact frontend origin(s), comma separated. A same-domain Vercel deployment does not need this setting.

No frontend environment variable is required for this single-domain setup. The browser uses relative `/api` requests. If you later host the API on a different origin, set the public `VITE_API_BASE_URL` value at build time to that API origin (for example, `https://api.example.com`). This setting is exposed in browser code and must never contain credentials or other secrets. `frontend/.env.example` documents the optional setting.

For MongoDB Atlas, ensure its network access settings allow connections from your deployment. Atlas IP allowlisting and Vercel's changing outbound IPs can require a suitable Atlas network policy or a Vercel static outbound IP feature available to your plan. Do not use an unrestricted database user; grant only the permissions the application needs.

After adding or changing environment values, create a new deployment so the function receives them. Never commit `.env` files or paste secrets into source code.

## Verify the deployment

After deployment, open the Vercel URL and check `/api/health` returns `{"status":"ok"}`. Then register a test user and verify sign-in, sign-out, project/task access, and AI actions if Groq is configured. Confirm the browser's network panel shows same-origin `/api/...` requests and no CORS or cookie errors.

Vercel serves the production build; the Express static-file middleware is retained for the existing local single-server workflow. MongoDB is opened lazily and reused across warm function invocations.

## Deploy only the backend as a separate Vercel project

Create another Vercel project from the same repository and set its **Root Directory** to `backend`. The `backend/vercel.json` and `backend/api/[...path].js` files expose the existing Express routes as serverless API routes; do not use the local `npm start` command as the Vercel function entry point. Vercel installs the dependencies from `backend/package.json` and its lockfile.

Set the required backend variables above in this backend project's Vercel settings. Also set `FRONTEND_ORIGINS` to the exact deployed frontend origin (no trailing slash) so credentialed browser requests pass CORS. Keep `COOKIE_SECURE=true`. If frontend and backend are on different sites and browser sign-in cookies are blocked, set `COOKIE_SAME_SITE=none`; this requires HTTPS and `COOKIE_SECURE=true`. The default is `strict`. Set the frontend Vercel build variable `VITE_API_BASE_URL` to the backend's origin (for example, `https://taskflow-api.vercel.app`) and redeploy the frontend. This URL is public; never place secrets there.

The backend API health check is then available at `https://<backend-domain>/api/health`. Atlas must also permit connections from the backend deployment's network.
