const { PrismaClient } = require("@prisma/client");

// Reuse one client per serverless instance.
const prisma = globalThis.__threeBellsPrisma || new PrismaClient();
globalThis.__threeBellsPrisma = prisma;

module.exports = prisma;
