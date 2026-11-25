// Prisma CLI configuration (Prisma 7+). Only the CLI reads this file; the app
// connects through the driver adapter in lib/db.js.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Optional on purpose: `prisma generate` runs on every npm install (postinstall),
  // including CI jobs with no database. Commands that need a database, such as
  // `prisma migrate`, fail with a clear error when DATABASE_URL is missing.
  datasource: { url: process.env.DATABASE_URL },
});
