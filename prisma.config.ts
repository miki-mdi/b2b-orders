import "./scripts/load-env";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved the connection URL (and migration seed command) out of
// schema.prisma and into this file - schema.prisma's datasource block now
// only declares the provider.
//
// This URL is deliberately NOT the same one the running application uses.
// `prisma migrate` needs DDL rights (CREATE/ALTER/DROP TABLE), so it
// connects as the b2b_orders_migrator role, which owns the database. The
// app itself (src/lib/db/prisma.ts) connects as the separate, low-privilege
// b2b_orders_app role via DATABASE_URL, which cannot run DDL at all - see
// prisma/rls/README.md for exactly why the two roles are kept apart.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("MIGRATE_DATABASE_URL"),
  },
});
