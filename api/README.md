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

## Social media downloads

ZUKO includes a first-party social downloader powered by the locally installed yt-dlp engine. It does not proxy David Cyril, OmegaTech, or another downloader API.

Supported convenience routes:

- `GET /v1/download/social?url=...&type=video`
- `GET /v1/download/social?url=...&type=audio`
- `GET /v1/download/social?url=...&type=info`
- `GET /v1/download/tiktok?url=...`
- `GET /v1/download/instagram?url=...`
- `GET /v1/download/facebook?url=...`
- `GET /v1/download/twitter?url=...`
- `GET /v1/download/pinterest?url=...`

Only public URLs are intended. Platform support can change as websites change their extraction mechanisms; yt-dlp's own supported-sites documentation notes that listed sites are not guaranteed to work forever. See the official supported-sites list for the current extractor catalog.


## Impersonation
The API installs `curl-cffi` and runs yt-dlp with a configurable browser impersonation target. The default is `Chrome-131:Android-14`. Set `YTDLP_IMPERSONATE` to another target supported by the installed yt-dlp build. There is no downloader fallback.


## Developer account email verification

New developer accounts require email verification before sign-in. Email delivery is handled through Resend, which is designed to work directly from Railway Node.js services.

Required Railway variable:

- `RESEND_API_KEY` — your Resend API key.

Optional:

- `RESEND_FROM_EMAIL` — a verified sender such as `ZUKO API <noreply@yourdomain.com>`. The default is `ZUKO API <onboarding@resend.dev>` for initial testing.
- `PUBLIC_BASE_URL` — optional when using the Railway-generated domain because `RAILWAY_PUBLIC_DOMAIN` is detected automatically.
- `VERIFICATION_TOKEN_TTL_MINUTES=30`
- `EMAIL_VERIFICATION_REQUIRED=true`

The registration flow creates the account, sends a single-use verification link, and does not create a login session until the email is verified. Unverified users can request a fresh link from the console.

For production sending, verify your own domain in Resend and set `RESEND_FROM_EMAIL`.
