import "./scripts/load-env";
import { defineConfig } from "prisma/config";

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
//
// Deliberately `process.env.MIGRATE_DATABASE_URL`, NOT the `env()` helper
// from `prisma/config`: `env()` throws as soon as this config file is
// evaluated if the named variable is missing - and this file is evaluated
// for EVERY prisma CLI command, including `prisma generate`, which never
// actually needs a database connection (it only reads schema.prisma to
// emit client types). A deploy environment that legitimately never holds
// MIGRATE_DATABASE_URL (e.g. the running app's own host - see
// docs/SESSION_HANDOFF.md's deployment-readiness notes on why the app
// service must never receive the migrator credential) would otherwise fail
// `npm install`'s `postinstall: prisma generate` step entirely. Using
// `process.env` directly here just returns `undefined` instead of throwing;
// a command that actually needs to connect (`migrate deploy`, `db push`)
// still fails naturally and clearly when it tries to connect with an
// undefined URL - the right failure point, not a config-load-time one.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.MIGRATE_DATABASE_URL,
  },
});
