# Prisma Version

**Stay on Prisma 6 for now.** Do not upgrade to Prisma 7.

Prisma 7 introduces breaking changes that require significant refactoring:

- New `prisma.config.ts` configuration file required
- Driver adapter pattern changes PrismaClient instantiation
- ESM-only module format (project currently uses CommonJS)
- New generator provider and required output path in schema
- Import paths change from `@prisma/client` to local generated path
- Uncertain compatibility with `@quixo3/prisma-session-store`

When dependabot PRs appear for Prisma 7, close them or leave them until the project is ready for the migration.
