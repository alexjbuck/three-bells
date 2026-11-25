---
"three-bells": patch
---

Database and build fixes

- Postgres connections request `sslmode=verify-full` explicitly, which removes the `pg` SSL security warning from the logs without changing how connections are verified
- Prisma's install scripts are approved for newer npm versions, so production builds keep downloading the engine migrations need
