# ZUKO-APPI New Endpoints

- `GET /v1/tools/url-info?url=https://example.com` — public URL metadata.
- `GET /v1/tools/dns?domain=example.com&type=MX` — DNS lookup.
- `GET /v1/tools/qr?text=https%3A%2F%2Fexample.com` — PNG QR code.
- `POST /v1/ai/vision` with JSON `{ "image": "https://...", "mode": "describe", "detail": "detailed" }` — Qwen Vision.
- TikTok downloader already exists at `GET /v1/download/tiktok?url=...` and is retained.
