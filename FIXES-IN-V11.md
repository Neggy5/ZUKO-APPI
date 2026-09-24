# ZUKO API v11 — Email Validation Fix

- Normalized pasted email addresses using Unicode NFKC.
- Removed zero-width/BOM characters that can make a visually correct address fail validation.
- Removed only whitespace immediately around `@` and `.` separators.
- Added stricter but standards-friendly local/domain validation.
- Added `express.urlencoded()` support alongside JSON parsing.
- Normalized email in the browser before login and registration.
- No secrets or Railway variables were changed.
