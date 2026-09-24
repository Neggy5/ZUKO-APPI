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
- `/v1/download/snapchat`

All routes require a ZUKO API key like other `/v1/*` endpoints. Public URLs only. Do not use these endpoints to bypass authentication, access controls, DRM, or private content.

## Architecture

```text
Client -> ZUKO API -> social endpoint -> local yt-dlp -> temporary file -> client
```

No third-party downloader API is called by these routes.

## Platform support

The social routes intentionally use an allowlist for the main platforms. yt-dlp supports a large and changing set of sites, so Snapchat public links are supported through the same public-URL yt-dlp path; additional platforms can be added to `api/lib/social.js` after testing them. Its official documentation says support can break when sites change and recommends testing the actual URL.


## Impersonation
The API installs `curl-cffi` and runs yt-dlp with a configurable browser impersonation target. The default is `Chrome-131:Android-14`. Set `YTDLP_IMPERSONATE` to another target supported by the installed yt-dlp build. There is no downloader fallback.

## New convenience endpoints

- `GET /v1/ytmp3?url=<YouTube URL>` — YouTube audio/MP3
- `GET /v1/ytmp4?url=<YouTube URL>` — YouTube video
- `GET /v1/download/snapchat?url=<public Snapchat URL>&type=video|audio|info`
- `POST /v1/upload` — multipart upload using field `file`

The upload endpoint stores files in a Railway S3-compatible Storage Bucket and returns a temporary presigned media URL. Configure the bucket credentials in Railway before using it.


## Additional social endpoints

Each supported platform now has a metadata route:

- `GET /v1/download/tiktok/info?url=...`
- `GET /v1/download/instagram/info?url=...`
- `GET /v1/download/twitter/info?url=...`
- `GET /v1/download/snapchat/info?url=...`
- `GET /v1/download/social/info?url=...`

The existing downloader routes also accept `type=video`, `type=audio`, or `type=info`.
The social extractor now uses normalized URLs, browser-like headers/referers, broader mobile/share host detection, and one safe retry without impersonation when an extractor rejects the configured impersonation profile.
