# Session Handoff

Snapshot of where this project stands, for picking work back up in a new session. See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for the original phase plan this has been following, and the other `docs/` files for the underlying architecture decisions — this file is a status snapshot, not a replacement for them.

## Status: Phase 0, Phase 1A, Phase 1B, and Phase 1C complete and committed

| Phase | Scope | Commit |
|---|---|---|
| Phase 0 | Multi-tenant foundation - Next.js/Prisma/RLS/Auth.js/i18n | `cf6ca86` |
| Phase 1A | Seller catalog - categories, units of measure, products, packaging (ProductUnit) | `ce5a3aa` |
| Phase 1B | Seller customers & pricing - customers, addresses, price lists, assignment, discount, visibility | `3678f95` |
| Phase 1C | Buyer catalog, cart, and order submission | `82032d7` |

**Latest commit: `82032d7`** on `main`. Working tree is clean. Nothing has been pushed to a remote (none is configured) - all work is local-only, per every phase's instructions so far.

**Phase 1D has not been started.** See §10 below for its proposed scope, pending approval.

## 1. Migrations (applied, in order)

1. `20260919205020_init` - initial schema (all Phase 0 tables) + the full RLS policy set
2. `20260919214056_fix_customer_context_nullif` - RLS bugfix: `NULLIF(current_setting(...), '')` around every "is customer context unset" check (see §3 and §7)
3. `20260919235839_add_catalog_i18n_sku_barcode` - Phase 1A: MK/EN name fields, `isActive` on Category/UnitOfMeasure, product-level `sku`, `barcode` on Product/ProductUnit
4. `20260920002706_add_user_context_membership_read_exemption` - RLS fix: `app.current_user_id` read-only exemption on TenantMembership/CustomerMembership (see §3 and §7)
5. `20260920004502_customer_pricing_fields` - Phase 1B: `Customer.code/contactEmail/contactPhone/notes`, `CustomerAddress.phone`, `PriceList.code/description/isActive`

**Phase 1C added no migration.** The schema already had everything the buyer ordering flow needed: `Order`/`OrderLine`'s full snapshot fields, `Order.status` already included `CANCELLED` with `cancelledBy`/`cancelReason` (so buyer cancellation needed no new state), and `Tenant.cutOffTime`/`cutOffEnforcement` already existed for the soft cut-off warning. The cart itself is deliberately browser-only and touches no table at all - see §8.

All migrations were generated via `prisma migrate diff` + manually placed migration folders and applied via `prisma migrate deploy`, **not** `prisma migrate dev` - that command refuses to run non-interactively in this environment whenever there's any warning to confirm (even a harmless one), which is every migration so far. See [prisma/rls/README.md](../prisma/rls/README.md) and this file's own migration folders for the exact workflow if another migration is needed.

Local dev database: PostgreSQL 17, `b2b_orders_dev`, two roles (`b2b_orders_migrator` owns everything and runs migrations; `b2b_orders_app` is the low-privilege runtime role - see [prisma/rls/README.md](../prisma/rls/README.md)). Credentials live only in the untracked `.env.local` - not reproduced here.

## 2. Auth / RLS architecture (as it stands today)

- **Identity**: single global `User` table + `TenantMembership` (seller-side) + `CustomerMembership` (buyer-side), not separate Seller/Customer user tables - see [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §4.
- **Auth.js v5**, Credentials provider, JWT sessions (Credentials forces JWT - DB sessions aren't possible with it). The `jwt` callback re-resolves the active membership from the database on every request via `resolveActiveMembership()`, so a deactivated user/membership/suspended tenant loses access on the next request, not just at token expiry.
- **Three-layer tenant/customer isolation**:
  1. **Layer 2 (app)**: a Prisma Client Extension (`src/lib/db/scoped-client.ts`) auto-injects `tenantId`/`customerId` into every query against a scoped model, driven by AsyncLocalStorage context set by `withTenantContext`/`withCustomerContext` (`src/lib/db/with-tenant.ts`).
  2. **Layer 3 (RLS)**: PostgreSQL Row-Level Security on every tenant-owned table, keyed on `app.current_tenant_id` (required) and `app.current_customer_id` (optional, narrows buyer-facing tables to one customer). Source of truth: [prisma/rls/policies.sql](../prisma/rls/policies.sql).
  3. **A third, narrowly-scoped exemption**: `app.current_user_id`, used ONLY by `withUserContext()` (`src/lib/db/with-user-context.ts`) for the login/membership-discovery step, where no tenant is known yet. It's a **SELECT-only** RLS exemption on exactly two tables (`TenantMembership`, `CustomerMembership`) letting a user read their own membership rows across tenants; INSERT/UPDATE/DELETE policies on both tables are unchanged and still require a real tenant context - identity alone can never create or modify a membership.
- **Domain services never accept tenantId/customerId from the browser** - every seller route calls `requireSellerSession()` (`src/lib/auth/require-seller.ts`) server-side to get the tenantId from the session, never from a route param or form field. **Phase 1C added the symmetric buyer-side guard**, `requireBuyerSession()` (`src/lib/auth/require-buyer.ts`): confirms an active `CustomerMembership` session and returns `tenantId`/`customerId`/`role`, redirecting away (never from a route param/form field either) for an anonymous, seller, or platform-admin session. Every route under `src/app/[locale]/buyer/` is gated by this in `buyer/layout.tsx`, exactly mirroring how `seller/layout.tsx` gates seller routes.
- Every catalog/customer/pricing mutation writes an `AuditLogEntry` in the same transaction as the change (`src/lib/domain/audit/audit-log.ts`). **Phase 1C follows the same rule** for order creation (`action: "CREATE"`, `entityType: "Order"`) and buyer-initiated cancellation (`action: "UPDATE"`, `actingContext: "CUSTOMER"`).

## 3. Known issues discovered and fixed (all resolved, all covered by regression tests unless noted)

1. **RLS `::uuid` cast bug** (fixed in migration 2): policies cast the session variable to `uuid` and compared against columns that are actually `TEXT` (Prisma's client-generated ids, not native `uuid`). Fixed to plain text comparison throughout.
2. **Connection-reuse RLS bug** (fixed in migration 2): once a pooled connection had `app.current_customer_id` set at least once, a later transaction on that same connection that never set it again saw `current_setting(...)` return `''` (empty string), not `NULL` - silently restricting a seller-only session as if it were scoped to a nonexistent customer. Fixed with `NULLIF(..., '') IS NULL` everywhere that check appears. Regression test: `tests/isolation/connection-reuse.test.ts`.
3. **Structural login bug** (fixed in migration 4): `resolveActiveMembership()` could never see a real membership row, because RLS on `TenantMembership`/`CustomerMembership` required a tenant context that doesn't exist yet during login - discovering the tenant *is* the point of that query. Fixed with the `app.current_user_id` exemption described in §2. Regression tests: `tests/auth/membership-discovery.test.ts`.
4. **Stale uncontrolled-input UI bug** (Phase 1B, code fix only, no migration): the customer's price-list-assignment `<select>` and discount `<input>` use `defaultValue` (uncontrolled), which doesn't re-sync when a Server Action updates the data without a redirect. Fixed by keying `PricingSection` on the current values so it remounts on an actual change (`src/app/[locale]/seller/customers/[id]/edit/page.tsx`). Found and verified via manual browser testing, not automated tests (it's a client-rendering issue, not a data-correctness one).
5. **Order-number allocation race** (Phase 1C, code fix only, no migration - found and fixed during implementation, before the commit): `submitOrder`'s order-number aggregate originally ran inside the buyer's `withCustomerContext` transaction. RLS's Tier 2 customer-narrowing (by design - see [SECURITY_AND_MULTI_TENANCY.md](SECURITY_AND_MULTI_TENANCY.md) §2) meant that query only ever saw the *current customer's own* orders, not the whole tenant's - so two different customers submitting their first order both computed "next number = 1" and collided on the `(tenantId, orderNumber)` unique constraint. This surfaced immediately in `tests/buyer/order-history-isolation.test.ts`. Fixed by reading the tenant-wide max via a separate `withTenantContext` call (no row content exposed, just a count) before opening the customer-scoped write transaction; `submitOrder` retries up to 5 times on a unique-constraint conflict. See `src/lib/domain/orders/order-service.ts`'s `attemptSubmitOrder` for the exact reasoning left in comments there.
6. **Next.js 16 `middleware.ts` → `proxy.ts` rename** (Phase 1C, found during manual browser verification, not caught by any automated test): Next.js 16 deprecated the `middleware.ts` file convention in favor of `proxy.ts` (must also live under `src/`, alongside `src/app`, not at the repo root). This project's `middleware.ts` was written against the old convention and was **silently never invoked** - which meant next-intl's locale redirect/rewrite never ran for any bare, unprefixed URL. In practice this was masked the whole time because every internal link/redirect in the app already used next-intl's locale-aware `Link`/`redirect` helpers (always emitting an explicit `/mk/...` or `/en/...` URL) - the only way to trigger it was a bare `redirect("/")` or `redirect("/sign-in")` call (used by `requireSellerSession`/`requireBuyerSession` for the "wrong role" and "not signed in" cases) or a real visitor hitting the bare domain root with no locale in the URL, which would have 404'd. Fixed by replacing `middleware.ts` with `src/proxy.ts` (same `createMiddleware(routing)` call, just the file convention Next.js 16 now expects). Verified by hand in the browser pane: unauthenticated → `/mk/sign-in`, wrong-role → `/mk` home, and a bare `http://localhost:3000/` now correctly locale-redirects instead of 404ing. Not covered by an automated test (no existing test suite exercises the Next.js routing/middleware layer directly - all DB-backed tests call domain functions directly, bypassing HTTP routing entirely).

None of these are open - all six are fixed, and 1-5 are migrated/regression-tested where relevant; 6 was verified manually (see §7) since it's routing/framework-layer, not domain logic.

## 4. Pricing resolution rules

`resolveEffectivePrice(tenantId, customerId, productUnitId)` in `src/lib/domain/pricing/pricing-resolution.ts` - written in Phase 1B specifically for "the future Buyer flow to reuse as-is," and Phase 1C does exactly that: the buyer catalog (`listBuyerCatalog`) and cart/checkout resolution (`resolveCartLine`) both call it unchanged, with no buyer-specific fork of the pricing logic. Checked in this exact order, failing safe (a typed `reason`, never a guess or a throw) at every step:

1. Customer must be active (`CUSTOMER_INACTIVE` otherwise).
2. The `Product` **and** its `ProductUnit` must both be active - checked *before* visibility, so an inactive item is unavailable regardless of any override (`PRODUCT_INACTIVE` / `PRODUCT_UNIT_INACTIVE`).
3. Visibility: visible by default; an explicit `CustomerProductVisibility` row of `HIDDEN` overrides that (`HIDDEN_FOR_CUSTOMER`). A `VISIBLE` row is a no-op (visible is already the default).
4. Customer must have an active `CustomerPriceListAssignment`, pointing at an active `PriceList` (`NO_ASSIGNMENT` otherwise, including when the assigned list has been deactivated).
5. That price list must have a `PriceListItem` for this exact `productUnitId` - no fallback to another packaging or another list (`NO_PRICE` otherwise).
6. The customer's flat `discountPercent` (0-100, no promotions engine) is applied **after** the base price-list price: `finalPrice = basePrice * (1 - discountPercent / 100)`, rounded to 2 decimals. No discount on file behaves as 0%.

The buyer catalog silently excludes any `ProductUnit` this function reports unavailable for, rather than showing it as disabled/greyed-out - per the Phase 1C brief ("hides items that have no valid effective price or are otherwise unavailable").

## 5. Test status

**165 tests passing, 0 failing** (up from 104 at the end of Phase 1B; **61 new tests** added in Phase 1C), across 18 files (`npm test`):
- `tests/isolation/` - tenant-isolation, connection-reuse, catalog-isolation, customer-pricing-isolation (cross-tenant read/write rejection, cross-tenant reference rejection, RLS-alone checks bypassing the app layer)
- `tests/auth/membership-discovery.test.ts` - login discovers Tenant/Customer memberships, user A can't read user B's via `current_user_id`, identity alone can't write a membership, missing context fails safely
- `tests/catalog/catalog-crud.test.ts`, `tests/pricing/pricing-crud.test.ts` - CRUD happy paths, audit trail, inactive-record behavior, duplicate-value prevention
- `tests/pricing/pricing-resolution.test.ts` - discount math, rounding, visibility precedence, every fail-safe path in §4
- `tests/unit/catalog-validation.test.ts`, `tests/unit/pricing-validation.test.ts` - pure Zod schema tests, no DB
- **`tests/unit/cutoff.test.ts`** (Phase 1C) - the exact next-day/same-day/past-cutoff decision matrix for the soft warning, with an injectable clock so it's fully deterministic
- **`tests/unit/order-totals.test.ts`** (Phase 1C) - discount-then-VAT arithmetic, rounding, `confirmedQty` vs `requestedQty` precedence
- **`tests/unit/order-validation.test.ts`** (Phase 1C) - zod schemas for cart lines, order submission, cancellation
- **`tests/buyer/catalog.test.ts`** (Phase 1C) - hidden/inactive/unpriced exclusion, per-customer visibility (not global), category filter, search by product/unit SKU and name, effective (discounted) price shown
- **`tests/buyer/cart-resolution.test.ts`** (Phase 1C) - min-qty/increment enforcement (with floating-point tolerance), `NOT_FOUND`/`HIDDEN_FOR_CUSTOMER`/`INVALID_QUANTITY`, and an explicit assertion that price/VAT/totals only ever come from the database, never a caller-supplied value
- **`tests/buyer/order-submission.test.ts`** (Phase 1C) - snapshot correctness, sequential order numbering (the bug in §3 item 5 would have been caught here), empty-cart/address-ownership/cross-tenant rejection, whole-order rejection on any invalid line, **server-side re-pricing at submission** (changes a price after "add to cart," asserts the stored snapshot reflects the new price, not the old one), cut-off warning persisted on the order, inactive-customer rejection
- **`tests/buyer/order-cancellation.test.ts`** (Phase 1C) - cancel-while-`SUBMITTED` succeeds immediately with an audit entry, rejected once `CONFIRMED`/already `CANCELLED`, `OrderNotFoundError` for a bad id or another customer's order
- **`tests/buyer/order-history-isolation.test.ts`** (Phase 1C) - a customer's order list/detail never includes another customer's or another tenant's orders; the buyer catalog never leaks another tenant's products

Run with `npm test`. Vitest is configured with `fileParallelism: false` (`vitest.config.mts`) - every DB-backed test file shares one physical Postgres database and calls `resetDatabase()` in its own `beforeAll`, so file-level parallelism would let one file's reset wipe another's in-progress fixtures.

## 6. Production build status

`npm run build` succeeds cleanly (Next.js 16, Turbopack). 39 routes generated as of `82032d7` - the 29 seller-admin/auth routes from Phase 0-1B plus 7 new buyer routes (`/[locale]/buyer`, `/buyer/catalog`, `/buyer/cart`, `/buyer/checkout`, `/buyer/orders`, `/buyer/orders/[id]`, and the shared sign-in/NextAuth routes), plus the `[locale]` root and `_not-found`. `npm run lint`, `npm run typecheck`, and `prisma validate`/`prisma generate` are all clean (zero warnings, zero errors) as of the same commit. The build output correctly shows `ƒ Proxy (Middleware)` (not the old `Middleware` label), confirming the §3 item 6 fix is picked up.

## 7. Browser verification status

Manually verified end-to-end in the built-in browser pane (not just automated tests) for Phase 1A, 1B, and now **Phase 1C**, at mobile, tablet, and desktop widths:

- Sign-in as a seeded seller admin, membership resolves correctly (this is what caught issue #3 in §3)
- Category/unit/product/packaging create → list → edit flow (Phase 1A)
- Customer create, two addresses added (default-delivery exclusivity confirmed live), price list assigned, discount set and persisted, a product hidden for that customer and confirmed via a fresh page reload (Phase 1B)
- Duplicate price-list-item rejection surfaced correctly as a friendly form error in the actual UI, not just in tests (Phase 1B)
- **Phase 1C, signed in as a seeded buyer (`buyer-one@alpha.test`)**: catalog browsing showing the seeded product with correct price/VAT/min-qty; search (`q=Alpha` matches, `q=NoSuchThing` shows the empty state) and category filter both confirmed against live server requests, not just client-side; add-to-cart updates the nav badge instantly (browser-persisted cart, no server round trip needed for that step); cart page resolves live price/totals from the server; quantity update recalculates the badge and totals; checkout shows the default address preselected, note and delivery-date fields work, order summary totals match the cart; submitting redirects to the order-detail page with a success banner **and the cart badge disappears** (confirms `ClearCartOnMount` fires); order history lists both the seed's sample order and the newly submitted one with correct totals; requesting cancellation on the still-`SUBMITTED` seed order flips its status to "Откажана" (Cancelled) immediately, and the order-history list reflects it
- **Cross-role route protection, verified live** (not just via domain-layer tests): a buyer session hitting `/mk/seller` redirects to the home page (never sees seller content); a seller-admin session hitting `/mk/buyer/catalog` redirects to the home page (never sees buyer content); an unauthenticated session hitting `/mk/buyer/orders` redirects to `/mk/sign-in`
- This is exactly the testing that surfaced the §3 item 6 (`middleware.ts`→`proxy.ts`) bug - the redirect *destination* 404'd before the fix, even though the session check itself was already correctly blocking the wrong role

One environment quirk worth knowing about for future browser testing sessions: **Next.js's dev-mode indicator badge (bottom-left corner) can visually overlap a form's submit button at small viewport widths**, causing a click intended for the button to open the dev-tools popup instead. Workaround: click an offset position on the button clear of the badge, or use a wider viewport. A second quirk found in this session: **the browser automation tool's accessibility-tree (`read_page`) coordinates can go stale relative to the actual rendered layout after a viewport resize or client-side transition**, producing clicks that land on nothing; re-reading the page (or taking a fresh screenshot and clicking by literal coordinate) immediately before each click avoided this.

## 8. Cart architecture (Phase 1C)

**Decision: browser-persisted (localStorage), not server/session-persisted.** See `src/lib/cart/cart-storage.ts`'s header comment for the full reasoning; summary:

- The cart holds **only** `{ productUnitId, quantity }` pairs - never a price, name, or anything else that could go stale or be trusted. This is what makes "browser-persisted" safe: there is nothing sensitive or authoritative to protect in browser storage.
- No new table, no migration, no RLS policy - a server-persisted cart would have needed its own tenant/customer-scoped table and RLS surface for state that has zero historical or audit value once an order is actually placed.
- Implemented as a small external store (`src/lib/cart/cart-store.ts`) read via React's `useSyncExternalStore` (not `useState` + `useEffect`) - this project's lint config (`react-hooks/set-state-in-effect`) flags synchronous `setState` calls inside effects, and `useSyncExternalStore`'s server/client snapshot split is also the *correct* fix for the hydration-mismatch problem a naive "read localStorage on mount" effect would otherwise have.
- Scoped per-browser, not per-account: a buyer working across two devices simply has two independent carts. Acceptable for MVP; a cross-device cart would be a Phase 2+ upgrade to a real server-persisted design, not a small tweak to this one.

**Server-side re-pricing/revalidation rule (never trust the browser):** every place the cart's contents are turned into something priced or orderable goes through the exact same function, `resolveCartLine` (`src/lib/domain/orders/cart-resolution.ts`), which re-fetches from the database and ignores anything the caller might otherwise believe about price or availability:
1. **Cart page** - calls it (via the `resolveCartAction` Server Action) to show live prices/line totals and flag any item that's gone stale (hidden, deactivated, unpriced, now below the min-qty/increment).
2. **Checkout page** - calls it again for the order summary and the cut-off preview.
3. **`submitOrder`** - calls it a third and final time, authoritatively, immediately before writing the `Order`/`OrderLine` rows. If a seller changes a price or hides a product between "add to cart" and "submit," the buyer is charged the price at submission time, not whatever was shown earlier - proven by `tests/buyer/order-submission.test.ts`'s re-pricing test, which changes a price mid-test and asserts the stored snapshot reflects the new value.

If any line fails re-resolution at submission time (inactive, hidden, unpriced, wrong quantity, belongs to another tenant), the **entire order is rejected** with a structured `LINE_ISSUES` result naming which `productUnitId`s failed and why - never a partial order the buyer didn't ask for.

## 9. Order submission / snapshot rules (Phase 1C)

`submitOrder` (`src/lib/domain/orders/order-service.ts`) is the only path that creates an `Order`. Per line, in order:

1. Every line is resolved via `resolveCartLine` (§8) *before* any database write begins - if any line is invalid, nothing is written at all (verified by an explicit "order count unchanged" assertion in `tests/buyer/order-submission.test.ts`).
2. The customer must still be active and the delivery address must still belong to that customer and be active, both re-checked inside the write transaction (defense in depth beyond what the session guard already guarantees).
3. The order number is allocated from a **tenant-wide** read (see §3 item 5 for why this had to be separate from the customer-scoped write transaction), with retry-on-conflict.
4. The soft cut-off warning (`cutOffWarningShown`) is computed server-side from the tenant's `cutOffTime` and the requested delivery date - never trusted from the client, even though the client also computes a preview of the same thing for immediate UX feedback.
5. Per [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §6, the following are snapshotted onto each `OrderLine` and never re-derived from live catalog data again:
   - `productNameSnapshot`, `productSkuSnapshot`, `unitLabelSnapshot` (from the product/unit at submission time)
   - `unitPriceAtOrderTime` - the **base** price-list price (not the discounted price) and `discountPercentAtOrderTime` are stored as two separate fields, matching the schema's own decomposition (rather than collapsing them into one "final price" number), so a seller reviewing history later can see both the listed price and the discount that applied at the time
   - `vatRateAtOrderTime` - the product's own override if set, else the tenant's default
   - `requestedQty` (the buyer's requested quantity; `confirmedQty`/`deliveredQty` stay `null` until Phase 1D's confirmation step)
6. `Order.deliveryAddressSnapshot` (JSON) captures the full address at submission time; `deliveryAddressId` is kept only as a reference, never read live for display once an order exists.
7. The order is created directly in `SUBMITTED` status with `submittedAt` set - there is no `DRAFT`-then-submit two-step in this UI (Phase 1C didn't build a "save for later" cart).
8. One `AuditLogEntry` (`action: "CREATE"`, `entityType: "Order"`) is written in the same transaction as the order.
9. Totals (subtotal/VAT/total, both per-line and order-wide) are never stored as columns - they're computed on demand by `src/lib/domain/orders/order-totals.ts` from the snapshotted fields, used identically by the cart preview, checkout summary, order history list, and order detail page, so there is exactly one place that arithmetic lives.

## 10. Proposed Phase 1D scope (not started, pending approval)

Per [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md), the natural next slice is **Phase 3: Seller fulfillment flow**:

- Seller order review/confirm screen: per-line quantity adjustment at confirmation, with **every adjustment writing an `AuditLogEntry`** (who/when/old/new/reason) - the audit-log plumbing already exists (`writeAuditLogEntry`), this is new seller-facing UI and the domain logic to call it correctly for a field-level change rather than a whole-row snapshot.
- Status transitions `CONFIRMED → PICKING → READY → OUT_FOR_DELIVERY → DELIVERED` (manual seller status buttons per [ORDER_WORKFLOW.md](ORDER_WORKFLOW.md) §2).
- Marking a line unavailable at confirmation (sets `OrderLine.unavailableReason`, audited the same way as a quantity adjustment).
- Seller-initiated cancellation once `CONFIRMED` or later (manual action, no guided flow per the locked MVP rule - see [ORDER_WORKFLOW.md](ORDER_WORKFLOW.md) §3).
- Seller-entered orders on behalf of a customer, including selecting one of that customer's saved addresses - reuses the same `submitOrder`/`resolveCartLine` domain logic Phase 1C built, just invoked from a seller-side route with a seller actor instead of a buyer one.
- Notifications on the transitions listed in [ORDER_WORKFLOW.md](ORDER_WORKFLOW.md) §6 (in-app + email is acceptable for MVP).
- Basic seller dashboard: order counts by status, today's/this week's count and value, top products.

Explicitly **not** in Phase 1D per the standing constraints repeated in every phase brief so far: CSV import, Sales Rep role, ERP integration, credit-limit blocking, promotions, native mobile app, and no weakening of the RLS/auth architecture described in §2.

**Do not start Phase 1D without explicit approval** - this file is a status snapshot only.
