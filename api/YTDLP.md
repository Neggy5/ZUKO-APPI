# ZUKO first-party yt-dlp endpoints

ZUKO runs yt-dlp locally. It does not proxy David Cyril, OmegaTech, or another downloader API.

## Endpoints

- `GET /v1/download/info?url=...` — metadata
- `GET /v1/download/formats?url=...` — available formats
- `GET /v1/download/video?url=...&quality=720` — video download
- `GET /v1/download/audio?url=...` — MP3 audio download

All `/v1/*` endpoints use the normal ZUKO API-key authentication, quotas, rate limits and usage logging.

## Server requirements

The Docker image installs Python, yt-dlp and FFmpeg. yt-dlp recommends FFmpeg for merging separate audio/video streams and recommends its default extras plus a supported JavaScript runtime for full YouTube support. See the official yt-dlp documentation: https://github.com/yt-dlp/yt-dlp.

## Limits

`YTDLP_MAX_FILE_BYTES` defaults to 100 MiB. `YTDLP_TIMEOUT_MS` defaults to 120 seconds.

Only HTTP(S) URLs are accepted, credentials in URLs are rejected, and hosts resolving to private/local IP ranges are blocked to reduce SSRF risk.

Use the endpoint only for media you are authorized to download and in compliance with the source site's terms and applicable law.


## Impersonation
The API installs `curl-cffi` and runs yt-dlp with a configurable browser impersonation target. The default is `Chrome-131:Android-14`. Set `YTDLP_IMPERSONATE` to another target supported by the installed yt-dlp build. There is no downloader fallback.
