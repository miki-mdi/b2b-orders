# Session Handoff

Snapshot of where this project stands, for picking work back up in a new session. See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for the original phase plan this has been following, and the other `docs/` files for the underlying architecture decisions — this file is a status snapshot, not a replacement for them.

## Status: Phase 0, Phase 1A, and Phase 1B complete and committed

| Phase | Scope | Commit |
|---|---|---|
| Phase 0 | Multi-tenant foundation - Next.js/Prisma/RLS/Auth.js/i18n | `cf6ca86` |
| Phase 1A | Seller catalog - categories, units of measure, products, packaging (ProductUnit) | `ce5a3aa` |
| Phase 1B | Seller customers & pricing - customers, addresses, price lists, assignment, discount, visibility | `3678f95` |

**Latest commit: `3678f95`** on `main`. Working tree is clean. Nothing has been pushed to a remote (none is configured) - all work is local-only, per every phase's instructions so far.

**Phase 1C has not been started.** See §8 below for its proposed scope, pending approval.

## 1. Migrations (applied, in order)

1. `20260919205020_init` - initial schema (all Phase 0 tables) + the full RLS policy set
2. `20260919214056_fix_customer_context_nullif` - RLS bugfix: `NULLIF(current_setting(...), '')` around every "is customer context unset" check (see §3 and §7)
3. `20260919235839_add_catalog_i18n_sku_barcode` - Phase 1A: MK/EN name fields, `isActive` on Category/UnitOfMeasure, product-level `sku`, `barcode` on Product/ProductUnit
4. `20260920002706_add_user_context_membership_read_exemption` - RLS fix: `app.current_user_id` read-only exemption on TenantMembership/CustomerMembership (see §3 and §7)
5. `20260920004502_customer_pricing_fields` - Phase 1B: `Customer.code/contactEmail/contactPhone/notes`, `CustomerAddress.phone`, `PriceList.code/description/isActive`

All migrations were generated via `prisma migrate diff` + manually placed migration folders and applied via `prisma migrate deploy`, **not** `prisma migrate dev` — that command refuses to run non-interactively in this environment whenever there's any warning to confirm (even a harmless one), which is every migration so far. See [prisma/rls/README.md](../prisma/rls/README.md) and this file's own migration folders for the exact workflow if another migration is needed.

Local dev database: PostgreSQL 17, `b2b_orders_dev`, two roles (`b2b_orders_migrator` owns everything and runs migrations; `b2b_orders_app` is the low-privilege runtime role - see [prisma/rls/README.md](../prisma/rls/README.md)). Credentials live only in the untracked `.env.local` - not reproduced here.

## 2. Auth / RLS architecture (as it stands today)

- **Identity**: single global `User` table + `TenantMembership` (seller-side) + `CustomerMembership` (buyer-side), not separate Seller/Customer user tables - see [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §4.
- **Auth.js v5**, Credentials provider, JWT sessions (Credentials forces JWT - DB sessions aren't possible with it). The `jwt` callback re-resolves the active membership from the database on every request via `resolveActiveMembership()`, so a deactivated user/membership/suspended tenant loses access on the next request, not just at token expiry.
- **Three-layer tenant/customer isolation**:
  1. **Layer 2 (app)**: a Prisma Client Extension (`src/lib/db/scoped-client.ts`) auto-injects `tenantId`/`customerId` into every query against a scoped model, driven by AsyncLocalStorage context set by `withTenantContext`/`withCustomerContext` (`src/lib/db/with-tenant.ts`).
  2. **Layer 3 (RLS)**: PostgreSQL Row-Level Security on every tenant-owned table, keyed on `app.current_tenant_id` (required) and `app.current_customer_id` (optional, narrows buyer-facing tables to one customer). Source of truth: [prisma/rls/policies.sql](../prisma/rls/policies.sql).
  3. **A third, narrowly-scoped exemption**: `app.current_user_id`, used ONLY by `withUserContext()` (`src/lib/db/with-user-context.ts`) for the login/membership-discovery step, where no tenant is known yet. It's a **SELECT-only** RLS exemption on exactly two tables (`TenantMembership`, `CustomerMembership`) letting a user read their own membership rows across tenants; INSERT/UPDATE/DELETE policies on both tables are unchanged and still require a real tenant context - identity alone can never create or modify a membership.
- **Domain services never accept tenantId/customerId from the browser** - every seller route calls `requireSellerSession()` (`src/lib/auth/require-seller.ts`) server-side to get the tenantId from the session, never from a route param or form field.
- Every catalog/customer/pricing mutation writes an `AuditLogEntry` in the same transaction as the change (`src/lib/domain/audit/audit-log.ts`).

## 3. Known issues discovered and fixed (all resolved, all covered by regression tests)

1. **RLS `::uuid` cast bug** (fixed in migration 2): policies cast the session variable to `uuid` and compared against columns that are actually `TEXT` (Prisma's client-generated ids, not native `uuid`). Fixed to plain text comparison throughout.
2. **Connection-reuse RLS bug** (fixed in migration 2): once a pooled connection had `app.current_customer_id` set at least once, a later transaction on that same connection that never set it again saw `current_setting(...)` return `''` (empty string), not `NULL` - silently restricting a seller-only session as if it were scoped to a nonexistent customer. Fixed with `NULLIF(..., '') IS NULL` everywhere that check appears. Regression test: `tests/isolation/connection-reuse.test.ts`.
3. **Structural login bug** (fixed in migration 4): `resolveActiveMembership()` could never see a real membership row, because RLS on `TenantMembership`/`CustomerMembership` required a tenant context that doesn't exist yet during login - discovering the tenant *is* the point of that query. Fixed with the `app.current_user_id` exemption described in §2. Regression tests: `tests/auth/membership-discovery.test.ts`.
4. **Stale uncontrolled-input UI bug** (Phase 1B, code fix only, no migration): the customer's price-list-assignment `<select>` and discount `<input>` use `defaultValue` (uncontrolled), which doesn't re-sync when a Server Action updates the data without a redirect. Fixed by keying `PricingSection` on the current values so it remounts on an actual change (`src/app/[locale]/seller/customers/[id]/edit/page.tsx`). Found and verified via manual browser testing, not automated tests (it's a client-rendering issue, not a data-correctness one).

None of these are open - all four are fixed, migrated (where relevant), and regression-tested.

## 4. Pricing resolution rules

`resolveEffectivePrice(tenantId, customerId, productUnitId)` in `src/lib/domain/pricing/pricing-resolution.ts` - the function the future Buyer flow is expected to reuse as-is. Checked in this exact order, failing safe (a typed `reason`, never a guess or a throw) at every step:

1. Customer must be active (`CUSTOMER_INACTIVE` otherwise).
2. The `Product` **and** its `ProductUnit` must both be active - checked *before* visibility, so an inactive item is unavailable regardless of any override (`PRODUCT_INACTIVE` / `PRODUCT_UNIT_INACTIVE`).
3. Visibility: visible by default; an explicit `CustomerProductVisibility` row of `HIDDEN` overrides that (`HIDDEN_FOR_CUSTOMER`). A `VISIBLE` row is a no-op (visible is already the default).
4. Customer must have an active `CustomerPriceListAssignment`, pointing at an active `PriceList` (`NO_ASSIGNMENT` otherwise, including when the assigned list has been deactivated).
5. That price list must have a `PriceListItem` for this exact `productUnitId` - no fallback to another packaging or another list (`NO_PRICE` otherwise).
6. The customer's flat `discountPercent` (0-100, no promotions engine) is applied **after** the base price-list price: `finalPrice = basePrice * (1 - discountPercent / 100)`, rounded to 2 decimals. No discount on file behaves as 0%.

## 5. Test status

**104 tests passing, 0 failing**, across 10 files (`npm test`):
- `tests/isolation/` - tenant-isolation, connection-reuse, catalog-isolation, customer-pricing-isolation (cross-tenant read/write rejection, cross-tenant reference rejection, RLS-alone checks bypassing the app layer)
- `tests/auth/membership-discovery.test.ts` - login discovers Tenant/Customer memberships, user A can't read user B's via `current_user_id`, identity alone can't write a membership, missing context fails safely
- `tests/catalog/catalog-crud.test.ts`, `tests/pricing/pricing-crud.test.ts` - CRUD happy paths, audit trail, inactive-record behavior, duplicate-value prevention
- `tests/pricing/pricing-resolution.test.ts` - discount math, rounding, visibility precedence, every fail-safe path in §4
- `tests/unit/catalog-validation.test.ts`, `tests/unit/pricing-validation.test.ts` - pure Zod schema tests, no DB

Run with `npm test`. Vitest is configured with `fileParallelism: false` (`vitest.config.mts`) - every DB-backed test file shares one physical Postgres database and calls `resetDatabase()` in its own `beforeAll`, so file-level parallelism would let one file's reset wipe another's in-progress fixtures.

## 6. Production build status

`npm run build` succeeds cleanly (Next.js 16, Turbopack). 29 routes generated as of `3678f95`, all seller-admin routes under `/[locale]/seller/...` plus sign-in and the NextAuth route. `npm run lint` and `npm run typecheck` are both clean (zero warnings, zero errors) as of the same commit.

## 7. Browser verification status

Manually verified end-to-end in the built-in browser pane (not just automated tests) for both Phase 1A and Phase 1B, at mobile, tablet, and desktop widths:

- Sign-in as a seeded seller admin, membership resolves correctly (this is what caught issue #3 in §3)
- Category/unit/product/packaging create → list → edit flow (Phase 1A)
- Customer create, two addresses added (default-delivery exclusivity confirmed live), price list assigned, discount set and persisted, a product hidden for that customer and confirmed via a fresh page reload
- Duplicate price-list-item rejection surfaced correctly as a friendly form error in the actual UI, not just in tests

One environment quirk worth knowing about for future browser testing sessions: **Next.js's dev-mode indicator badge (bottom-left corner) can visually overlap a form's submit button at small viewport widths**, causing a click intended for the button to open the dev-tools popup instead. Workaround: click an offset position on the button clear of the badge, or use a wider viewport.

## 8. Proposed Phase 1C scope (not started, pending approval)

Per [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md), the natural next slice is the **Buyer-facing catalog and ordering flow** - the first phase that isn't purely seller-admin tooling:

- Buyer sign-in / session resolution (already works at the auth layer via `withCustomerContext`, per Phase 0 - just needs a real UI)
- Buyer catalog browsing: list/search products, respecting `CustomerProductVisibility` and active state, using `resolveEffectivePrice()` as-is (§4) rather than re-implementing pricing logic
- Cart and order submission against the `Order`/`OrderLine` schema (already exists, unused since Phase 0's seed data is the only thing that's ever written to it)
- Order status viewing for the buyer

Other candidates explicitly deferred from Phase 1A/1B and still open: CSV import for products/customers, Sales Rep/Warehouse/Driver/Buyer Employee role separation, delivery routes, promotions beyond the flat discount already implemented.

**Do not start Phase 1C without explicit approval** - this file is a status snapshot only.
