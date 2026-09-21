# ZUKO AI Chat

ZUKO exposes a first-party endpoint:

`POST /v1/ai/chat`

The public API contract belongs to ZUKO. The current backend is configurable and uses the OpenAI-compatible Atria Chat Completions API.

## Environment

```env
ATRIA_API_KEY=your_server_side_key
AI_BASE_URL=https://api.atria-asi.ai/v1
AI_MODEL=Atria-Dawn-Preview
AI_TIMEOUT_MS=60000
```

Never put `ATRIA_API_KEY` in dashboard HTML, frontend JavaScript, GitHub, or client applications.

## Request

```json
{
  "message": "Say hello from ZUKO"
}
```

or a conversation:

```json
{
  "messages": [
    {"role":"system","content":"You are ZUKO AI."},
    {"role":"user","content":"Hello"}
  ]
}
```

Optional controls: `temperature`, `max_tokens`, `top_p`.

## Response

```json
{
  "status": true,
  "reply": "Hello from ZUKO! 👋",
  "model": "Atria-Dawn-Preview",
  "usage": {},
  "requestId": "..."
}
```

ZUKO authentication, rate limiting, quota checks, request logging, and usage accounting happen before the endpoint executes.
