---
"three-bells": patch
---

Security hardening and OWASP Top 10 improvements

- Add security headers (X-Frame-Options, CSP, X-Content-Type-Options, Referrer-Policy)
- Fix session fixation vulnerability by regenerating session after OAuth login
- Sanitize error messages in production to prevent information leakage
- Add security logging for authentication events
- Remove X-Powered-By header
- Add trust proxy configuration for Vercel deployment

