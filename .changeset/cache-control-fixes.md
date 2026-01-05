---
"three-bells": patch
---

Fix cache-control headers to prevent caching on authentication routes

- Add cache-control headers in vercel.json for /api and /api/auth/\* routes
- Set no-cache headers programmatically in authentication and logout routes
- Prevent caching issues that could expose authenticated content to unauthenticated users
