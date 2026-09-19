import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires an explicit driver adapter - there is no more
// schema-level `datasource.url` (see prisma/schema.prisma's comment and
// prisma.config.ts). The connection string itself still comes from
// DATABASE_URL either way.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Standard Next.js dev-mode singleton: without this, every hot reload would
// open a fresh pool of Postgres connections until the dev server exhausts
// them. Production always gets exactly one client per process either way.
const globalForPrisma = globalThis as unknown as {
  prismaBase?: PrismaClient;
};

export const prismaBase =
  globalForPrisma.prismaBase ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaBase = prismaBase;
}
