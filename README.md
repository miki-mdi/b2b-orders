# B2B Orders

Multi-tenant B2B ordering platform for distributors/wholesalers and their business customers. See [docs/](docs/) for the full product and architecture design — start with [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Status**: Phase 0 (foundation) only. No seller/buyer product screens exist yet — see [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) for what's next.

## Stack

Next.js (App Router) · TypeScript · PostgreSQL · Prisma · Tailwind CSS · Auth.js (NextAuth v5) · next-intl (mk/en)

## Prerequisites

- Node.js 20+
- PostgreSQL 17 running locally (see below)

## Database setup

Phase 0 assumes a **local** PostgreSQL install (no Docker) with **two distinct, non-superuser roles** — see [prisma/rls/README.md](prisma/rls/README.md) for exactly why this split (not just "one app role") is what makes Row-Level Security actually take effect:

- `b2b_orders_migrator` — owns the database and schema, runs `prisma migrate` (DDL). Has `CREATEDB` only so `prisma migrate dev`'s shadow-database diffing works locally.
- `b2b_orders_app` — the role the running application connects as. No ownership, no DDL rights, not `SUPERUSER`/`CREATEDB`/`CREATEROLE`/`BYPASSRLS` — this is what lets RLS apply to it without any special-casing.

If PostgreSQL isn't installed yet:

```powershell
winget install --id PostgreSQL.PostgreSQL.17 --source winget --silent --accept-package-agreements --accept-source-agreements
```

This needs an elevated (Administrator) PowerShell/terminal — winget cannot silently accept the installer's UAC prompt otherwise.

Once PostgreSQL is running, connect as the superuser and run the full setup SQL:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres
```

```sql
CREATE ROLE b2b_orders_migrator WITH LOGIN PASSWORD '<MIGRATOR_PASSWORD>'
  NOSUPERUSER CREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE b2b_orders_app WITH LOGIN PASSWORD '<APP_PASSWORD>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

CREATE DATABASE b2b_orders_dev OWNER b2b_orders_migrator;
REVOKE ALL ON DATABASE b2b_orders_dev FROM PUBLIC;
GRANT CONNECT ON DATABASE b2b_orders_dev TO b2b_orders_migrator, b2b_orders_app;

\c b2b_orders_dev

ALTER SCHEMA public OWNER TO b2b_orders_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO b2b_orders_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO b2b_orders_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO b2b_orders_app;

ALTER DEFAULT PRIVILEGES FOR ROLE b2b_orders_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO b2b_orders_app;
ALTER DEFAULT PRIVILEGES FOR ROLE b2b_orders_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO b2b_orders_app;
```

Replace both placeholders with real passwords, then put them in `.env.local`'s `MIGRATE_DATABASE_URL` (migrator) and `DATABASE_URL` (app) respectively — **two different connection strings**, since migrations and the running app deliberately use different roles.

The `ALTER DEFAULT PRIVILEGES ... FOR ROLE b2b_orders_migrator` statements mean every table/sequence created by a *future* migration is automatically usable by `b2b_orders_app` — no manual re-granting after each migration.

## Environment variables

```bash
cp .env.example .env.local
```

Fill in `DATABASE_URL` with the `b2b_orders_app` role's real password, and generate a real `AUTH_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Never commit `.env` or `.env.local` — only `.env.example` (placeholders only) is tracked.

## First-time setup

```bash
npm install
npm run db:migrate      # applies schema.prisma + the RLS policies in prisma/rls/policies.sql
npm run db:seed         # creates two tenants with customers/products/orders for local dev + isolation testing
npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the test suite once (Vitest) — includes the tenant/customer isolation suite in `tests/isolation/`, which needs a real database (see above) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run db:generate` | Regenerate the Prisma client after a schema change |
| `npm run db:migrate` | Create/apply a migration locally |
| `npm run db:migrate:deploy` | Apply existing migrations without generating a new one (CI/production) |
| `npm run db:seed` | Reset and re-seed local dev data (also runs automatically after `db:migrate` via Prisma's `seed` config in `package.json`) |
| `npm run db:studio` | Prisma Studio |

Seeded accounts (see `prisma/seed.ts`) all share the password `DevPassword123!`, e.g. `seller-admin@alpha.test`, `buyer-one@alpha.test`, `platform-admin@b2b-orders.test`.

## Project structure

```
docs/                         product/architecture documentation (read this first)
prisma/
  schema.prisma                 data model
  seed.ts                       dev + test seed data (two tenants)
  rls/                           Row-Level Security policies + setup notes
src/
  app/
    [locale]/                    all user-facing routes, under the locale prefix
      (auth)/sign-in/            minimal sign-in page (Phase 0 auth foundation only)
      page.tsx                   home page (session/membership status + locale switcher demo)
    api/auth/[...nextauth]/       Auth.js route handler
  components/                    shared UI components
  i18n/                          next-intl routing/config (mk default, en second)
  lib/
    auth/                        Auth.js config, password hashing, active-membership resolution
    db/                          Prisma client, the two-layer tenant/customer scoping mechanism
    domain/                      business logic per bounded area (thin in Phase 0 - see docs/ARCHITECTURE.md §4)
    validation/                  zod schemas
messages/                     en.json / mk.json translation catalogs
tests/
  isolation/                    tenant + customer isolation test suite
  setup/                        test environment setup (env loading)
```

## Tenant isolation - how to use it correctly

Read [docs/SECURITY_AND_MULTI_TENANCY.md](docs/SECURITY_AND_MULTI_TENANCY.md) before touching `src/lib/db/` or adding a new tenant-owned table. In short:

- Never import `prismaBase` (the unscoped client) for a tenant-owned table. Use `withTenantContext(tenantId, fn)` (seller-side) or `withCustomerContext(tenantId, customerId, fn)` (buyer-side) from `src/lib/db/with-tenant.ts`.
- Adding a new table with a `tenantId` column? Add it to `TENANT_SCOPED_MODELS` (and `CUSTOMER_SCOPED_MODELS` if it also has a `customerId`) in `src/lib/db/tenant-scoped-models.ts`, **and** add its RLS policy to `prisma/rls/policies.sql` (see that file's own header comment and `prisma/rls/README.md` for how it gets applied). Neither layer is generated automatically from `schema.prisma`.
- `npm test` re-runs the isolation suite against real cross-tenant data on every change - it's the fastest way to catch a forgotten policy or a missed scope.
