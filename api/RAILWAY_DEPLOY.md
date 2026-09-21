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

## 5. Email verification (Resend)

This build uses Resend instead of SMTP. Resend is supported directly on Railway and works from a normal Node.js service.

1. Create a Resend account and create one API key.
2. Add `RESEND_API_KEY` to the Railway API service Variables.
3. For initial testing, the application defaults to `ZUKO API <onboarding@resend.dev>`. For production, verify your own sending domain in Resend and set `RESEND_FROM_EMAIL` to that sender.

Railway exposes `RAILWAY_PUBLIC_DOMAIN` to the running service, so the application automatically builds verification links from the generated Railway HTTPS domain. You can still explicitly set `PUBLIC_BASE_URL` if you use a custom domain.

You do not need to configure SMTP host, port, username, password, or TLS settings.

## 6. Generate domain

Service → Settings → Networking → Generate Domain.

The generated domain is automatically detected by the application through Railway's `RAILWAY_PUBLIC_DOMAIN` variable. If you use a custom domain, set `PUBLIC_BASE_URL` to that HTTPS URL and redeploy.



`https://<your-domain>/auth/google/callback`




`https://<your-domain>/auth/github/callback`


## 9. Health check

Set Railway Healthcheck Path to `/healthz`. Railway can use this to determine whether the deployment is healthy before routing traffic.

## 10. Test

Open:

- `/healthz`
- `/dashboard`
- `/docs`

Create a developer account, create an API key, then test:

`GET /v1/tools/ping`

with:

`Authorization: Bearer <your-key>`

Expected response contains `"message":"pong"`.
