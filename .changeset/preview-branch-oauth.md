---
"three-bells": minor
---

Add OAuth support for Vercel preview branch deployments

Preview branches can now authenticate users via Google OAuth by routing through production:

1. Preview initiates OAuth, encoding its origin URL in the OAuth state parameter
2. Google redirects to production's callback (the only authorized redirect URI)
3. Production creates a signed auth token (HMAC-SHA256, 60-second expiry) containing user info
4. Production redirects to preview's `/api/auth/token` endpoint with the token
5. Preview verifies the token and creates a local session in its Neon branch database

Security features:
- Token signed with SESSION_SECRET using HMAC-SHA256
- 60-second token expiry prevents replay attacks
- Timing-safe signature comparison prevents timing attacks
- Redirect URL validation only allows localhost, production URL, and project-specific Vercel preview URLs
