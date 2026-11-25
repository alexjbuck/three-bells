const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { normalizeDatabaseUrl } = require("./db-url");

// Prisma 7 connects through a driver adapter. Reuse one client per serverless instance.
const prisma =
  globalThis.__threeBellsPrisma ||
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL) }),
  });
globalThis.__threeBellsPrisma = prisma;

module.exports = prisma;
