# ZUKO APPI v12 — Email Validation Fix

Fixed the registration bug where normal addresses such as `preciousbassey758@gmail.com` were rejected as invalid.

## Root cause
The v11 server-side email regex contained double-escaped regex tokens, so a normal domain such as `gmail.com` failed validation.

## Changes
- Replaced the broken domain validation with a correctly escaped email/domain validator.
- Kept Unicode/copy-paste normalization.
- Allows normal addresses including plus-tags.
- Browser-side normalization regexes corrected as well.
- Verified with Node syntax check and sample addresses.


## V13 admin/docs patch
- Admin login now returns the signed 12-hour admin token and the console stores it in sessionStorage and sends `x-admin-token`, while retaining the HttpOnly cookie fallback. This fixes hosted-browser cases where the login cookie is not returned on the immediate admin API requests.
- Developer docs now include cURL, Node.js, Python, PHP, and WhatsApp/Baileys examples plus API-key/header instructions and endpoint search/copy controls.
