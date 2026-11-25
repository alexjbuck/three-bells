// Vercel build step (`buildCommand` in vercel.json).
//
// Vercel's Git integration deploys this project. For production builds this applies
// pending Prisma migrations first, so schema changes are in place before the new code
// goes live; if migrations fail, the build fails and the previous deployment keeps
// serving. Preview builds skip this: their databases are migrated by the PR Checks
// workflow, and a preview must never apply unmerged migrations to production.
const { spawnSync } = require("node:child_process");

const env = process.env.VERCEL_ENV;
if (env !== "production") {
  console.log(`[vercel-build] VERCEL_ENV=${env || "unset"}: skipping migrations`);
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error("[vercel-build] DATABASE_URL is not set for the production build");
  process.exit(1);
}

const migrate = () =>
  spawnSync("npx", ["--no-install", "prisma", "migrate", "deploy"], { stdio: "inherit" }).status;

let status = migrate();
if (status !== 0) {
  // Serverless Postgres can be slow to wake; one retry matches the old workflow.
  console.log("[vercel-build] migrate failed, retrying in 5s");
  spawnSync("sleep", ["5"]);
  status = migrate();
}
process.exit(status ?? 1);
