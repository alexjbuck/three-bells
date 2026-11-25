---
"three-bells": patch
---

Security: close an account-takeover hole in the preview-deployment sign-in hand-off

- The OAuth `state` that carries the return URL is now signed by the deployment that starts sign-in; production ignores unsigned, expired or tampered states instead of redirecting to them
- Hand-off tokens are bound to the host they were issued for and rejected anywhere else
- The preview hostname allowlist now anchors the team suffix to the end of the hostname
