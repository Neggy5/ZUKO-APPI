# ZUKO API v10 fixes

- Removed browser `prompt()` dialogs from the developer console/admin payment flows.
- Added `/` and `/login` routes to the same current developer console.
- Added no-cache headers for the console and authentication routes so stale login JavaScript is not reused.
- Kept email/password registration, Resend verification, token expiry, resend-verification, and verified-login enforcement.
- Updated smoke tests to fail if browser prompts remain in dashboard/admin.
