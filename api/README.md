# ZUKO API

Standalone REST API service for Railway. Includes API keys, per-plan daily quotas, PostgreSQL usage/log storage, admin dashboard, YouTube search, translation, and an OpenAI-compatible AI adapter.

## Railway

1. Create a Railway project.
2. Add a PostgreSQL service. Railway exposes `DATABASE_URL` automatically; you can reference it from the API service as `${{Postgres.DATABASE_URL}}`.
3. Deploy this directory as its own service (set the service Root Directory to `api` if the repository contains the bot at the repository root), or deploy the included Dockerfile.
4. Set these variables:

- `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `ZUKO_ADMIN_PASSWORD=<strong password>`
- `ZUKO_ADMIN_SECRET=<32+ random characters>`
- `NODE_ENV=production`
- `PUBLIC_BASE_URL=https://your-generated-domain`
- `CORS_ORIGIN=https://your-generated-domain`
- optional AI: `AI_API_BASE`, `AI_API_KEY`, `AI_DEFAULT_MODEL`

5. Generate a Railway domain for the service.
6. Open `/admin/` for the dashboard and `/docs` for API documentation.

## Authentication

Public health endpoints are unauthenticated. All `/v1/*` endpoints require:

`Authorization: Bearer zuko_xxxxxxxxx`

API keys are stored hashed in PostgreSQL. The raw key is returned only at creation time by the admin dashboard.

## Plans

`free`: 100/day
`pro`: 10,000/day
`ultimate`: 100,000/day
`business`: 1,000,000/day

Change these values in `server.js` and redeploy if you need different quotas.

## Endpoints

- `GET /healthz`
- `GET /readyz`
- `GET /docs`
- `GET /admin/`
- `GET /v1/info`
- `GET /v1/search/youtube?q=...`
- `GET /v1/tools/translate?text=...&target=...`
- `POST /v1/ai/chat`

The AI endpoint expects an OpenAI-compatible `/chat/completions` endpoint. This keeps provider-specific credentials outside the public API contract.
