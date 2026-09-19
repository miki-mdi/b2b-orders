# Row-Level Security setup

`policies.sql` in this folder is the readable source of truth for every RLS policy in the database. Prisma has no native RLS support, so this SQL is not expressed in `schema.prisma` — it's applied as hand-written SQL appended to the initial migration.

## Two roles, on purpose

A single "database is safely walled off" story needs **two different Postgres roles**, not one:

| Role | Used by | Privileges | Why |
|---|---|---|---|
| `b2b_orders_migrator` | `prisma migrate dev` / `prisma migrate deploy` (via `MIGRATE_DATABASE_URL`, read by `prisma.config.ts`) | Owns the database and `public` schema, can run DDL. Has `CREATEDB` so `migrate dev`'s shadow-database diffing works locally | Needs to create/alter tables — RLS should never restrict schema migrations, and ownership is what makes that automatic |
| `b2b_orders_app` | the running Next.js application (`DATABASE_URL`, read by `src/lib/db/prisma.ts`) | `SELECT, INSERT, UPDATE, DELETE` on all tables/sequences, `USAGE` on the schema - **no** `CREATE`, **not** `SUPERUSER`/`CREATEDB`/`CREATEROLE`/`BYPASSRLS` | RLS policies apply automatically to any role that (a) isn't the table owner, (b) isn't a superuser, and (c) doesn't have `BYPASSRLS`. This role is deliberately none of those three, so isolation holds without any special-casing. `FORCE ROW LEVEL SECURITY` is added on top anyway as defense in depth (see `policies.sql`'s header comment) in case the app role is ever misconfigured to match the owner - but a superuser connection bypasses RLS **no matter what**, so the one hard rule that can never be relaxed is: **the app must never connect as a superuser.** |

See the main [README.md](../../README.md)'s "Database setup" section for the exact `CREATE ROLE`/`CREATE DATABASE`/`GRANT` statements, including the `ALTER DEFAULT PRIVILEGES ... FOR ROLE b2b_orders_migrator` lines that keep `b2b_orders_app`'s grants current on every future migration without manual re-granting.

## How the policies get applied

1. `prisma migrate dev --name init --create-only` generates `prisma/migrations/<timestamp>_init/migration.sql` from `schema.prisma` (table/column/index DDL only — Prisma doesn't know about RLS).
2. The content of `policies.sql` is appended to that same generated `migration.sql`, so RLS setup becomes part of migration history and is applied atomically with table creation by `prisma migrate dev` / `prisma migrate deploy` from then on.
3. Every subsequent `prisma migrate dev` for a *new* table must remember to add its own `ENABLE/FORCE ROW LEVEL SECURITY` + policy to that migration's SQL by hand, and append the same block to `policies.sql` here for documentation — Prisma will never generate this automatically. The isolation test suite (`tests/isolation/`) is written specifically to catch a forgotten one: it fails loudly if a tenant-scoped table doesn't enforce isolation, rather than assuming the policy exists.

## Two session variables

`app.current_tenant_id` is required on every scoped table (Seller vs. Seller isolation). `app.current_customer_id` is optional and only set for a buyer session (`withCustomerContext` in `src/lib/db/with-tenant.ts`); where it's set, the buyer-facing tables (`Customer`, `CustomerMembership`, `CustomerAddress`, `Order`, `CustomerPriceListAssignment`, `CustomerProductVisibility`, `FavoriteList`, and `FavoriteListItem` via its parent) are further narrowed to that one customer, so Buyer Company A can never read Buyer Company B's rows even though both share a `tenantId`. See `policies.sql`'s "Tier 2" section.

## Why `app.current_tenant_id` and not a Postgres role per tenant

A role-per-tenant design (`SET ROLE tenant_<id>`) would give equally strong isolation but doesn't scale operationally with an unbounded number of seller tenants (role management, connection pooling per role, migrations touching N roles). A single application role plus a session variable checked by policy, set fresh per transaction by `withTenantContext` (`src/lib/db/with-tenant.ts`), is the standard pattern for this and is what `docs/SECURITY_AND_MULTI_TENANCY.md` §2 describes.
