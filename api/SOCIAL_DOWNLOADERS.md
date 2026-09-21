# ZUKO Social Media Downloaders

ZUKO exposes first-party social downloader endpoints using the locally installed yt-dlp engine.

## Endpoints

`GET /v1/download/social?url=<URL>&type=video`

`GET /v1/download/social?url=<URL>&type=audio`

`GET /v1/download/social?url=<URL>&type=info`

Convenience routes:

- `/v1/download/tiktok`
- `/v1/download/instagram`
- `/v1/download/facebook`
- `/v1/download/twitter`
- `/v1/download/pinterest`

All routes require a ZUKO API key like other `/v1/*` endpoints. Public URLs only. Do not use these endpoints to bypass authentication, access controls, DRM, or private content.

## Architecture

```text
Client -> ZUKO API -> social endpoint -> local yt-dlp -> temporary file -> client
```

No third-party downloader API is called by these routes.

## Platform support

The social routes intentionally use an allowlist for the main platforms. yt-dlp supports a large and changing set of sites, so additional platforms can be added to `api/lib/social.js` after testing them. Its official documentation says support can break when sites change and recommends testing the actual URL.


## Impersonation
The API installs `curl-cffi` and runs yt-dlp with a configurable browser impersonation target. The default is `Chrome-131:Android-14`. Set `YTDLP_IMPERSONATE` to another target supported by the installed yt-dlp build. There is no downloader fallback.
