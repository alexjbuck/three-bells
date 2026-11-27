---
"three-bells": patch
---

Database and build fixes

- Postgres connections request `sslmode=verify-full` explicitly, which removes the `pg` SSL security warning from the logs without changing how connections are verified
- Prisma's install scripts are approved for newer npm versions, so production builds keep downloading the engine migrations need
- Dependency updates with security fixes: Express 5.3 and its request-parsing libraries (`body-parser`, `qs`, `path-to-regexp`), `express-rate-limit`, the session store, and patched versions of `effect` and `tinypool` in the tooling
