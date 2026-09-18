# ZUKO API — Railway Deployment

## 1. Push to GitHub

Push this project to a GitHub repository. Keep `.env` out of Git; commit only `.env.example`.

## 2. Create Railway project

1. Railway → New Project.
2. Deploy from GitHub Repo.
3. Select the repository.
4. If the API is in a monorepo, set the service root directory to `api`.
5. Railway detects the Node app automatically.

## 3. Add PostgreSQL

Add `+ New` → Database → PostgreSQL. Railway exposes `DATABASE_URL` and other Postgres variables to the project. Set the API service variable `DATABASE_URL` to `${{Postgres.DATABASE_URL}}` (adjust the service name if yours differs).

## 4. Required variables

Set:

- `NODE_ENV=production`
- `ZUKO_ADMIN_PASSWORD=<strong password>`
- `ZUKO_ADMIN_SECRET=<32+ random chars>`
- `SESSION_SECRET=<different 32+ random chars>`
- `PUBLIC_BASE_URL=https://<your-generated-domain>`
- `CORS_ORIGIN=https://<your-generated-domain>`

Do not commit OAuth client secrets or admin secrets.

## 5. Generate domain

Service → Settings → Networking → Generate Domain.

Copy that HTTPS domain into `PUBLIC_BASE_URL` and redeploy.



`https://<your-domain>/auth/google/callback`




`https://<your-domain>/auth/github/callback`


## 8. Health check

Set Railway Healthcheck Path to `/healthz`. Railway can use this to determine whether the deployment is healthy before routing traffic.

## 9. Test

Open:

- `/healthz`
- `/dashboard`
- `/docs`

Create a developer account, create an API key, then test:

`GET /v1/tools/ping`

with:

`Authorization: Bearer <your-key>`

Expected response contains `"message":"pong"`.
