---
"three-bells": patch
---

Upgrade Prisma from 6.19 to 7.10

- Database URL for the Prisma CLI moves to `prisma.config.ts`; the app connects through the `@prisma/adapter-pg` driver adapter
- `prisma generate` still works without `DATABASE_URL`, so installs in CI keep working
