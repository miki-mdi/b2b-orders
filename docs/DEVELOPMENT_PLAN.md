# Development Plan

## 1. Sequencing principle

Build the multi-tenant skeleton and data-isolation guarantees first, then the seller-side setup tools, then the buyer ordering flow, then the fulfillment flow. Do not build UI polish before the order state machine and audit trail are correct; do not build reporting before the workflow it reports on exists.

## 2. Phase 0 — Foundations (pre-feature work)

- Repo scaffold: Next.js + TypeScript + Tailwind, Prisma + cloud Postgres connection, environment/config setup.
- Auth.js integration with the unified `User` identity + active-membership session resolution (auto-select when a user has exactly one membership).
- Tenant-scoped Prisma client extension **and** PostgreSQL RLS policies on the first tables, enabled together, not sequenced — this was an explicit decision (see [SECURITY_AND_MULTI_TENANCY.md](SECURITY_AND_MULTI_TENANCY.md) §2), not deferred to a later hardening phase.
- **Verify the chosen managed Postgres provider's connection-pooling mode is compatible with per-transaction `SET LOCAL app.current_tenant_id`** before committing to a hosting plan (see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) §17) — this is a Phase 0 spike, not an assumption.
- Isolation test harness (two seeded tenants + a cross-tenant user) written before feature work builds on top of it.
- CI: type-check, lint, test, migration-check on every PR.
- i18n scaffolding (`next-intl`) with MK/EN from the first screen built.

## 3. Phase 1 — Seller setup tools (MVP)

- Platform Admin: create tenant + first Seller Admin membership.
- Seller: category, unit-of-measure, product CRUD, including `ProductUnit` (packaging option) CRUD.
- Seller: customer CRUD, customer address CRUD (multiple addresses per customer), membership management.
- Seller: price list CRUD (priced per `ProductUnit`) + customer assignment; per-customer visibility overrides; flat discount.
- Seller: default tenant VAT rate + per-product VAT override.
- Seller: cut-off time configuration (soft-warning only, per [ORDER_WORKFLOW.md](ORDER_WORKFLOW.md) §5).
- CSV import for products and customers.

*Milestone*: a Seller Admin can fully configure a tenant's catalog, addresses, and customer list without a developer.

## 4. Phase 2 — Buyer ordering flow (MVP)

- Buyer catalog browse/search, respecting visibility + pricing.
- Cart with per-`ProductUnit` min-qty/increment validation.
- Order submission: note, delivery date (with non-blocking cut-off warning), **delivery address selection** from saved addresses.
- Order snapshotting at submission (product name/SKU, unit label, price, discount, VAT, address) — built and tested here, since every later phase depends on it being correct.
- Order history, reorder, favorites.
- Buyer-initiated cancellation request while `SUBMITTED` (immediate, no approval step).

*Milestone*: a Buyer can place a real order end-to-end, and that order's historical snapshot survives a subsequent catalog/address edit unchanged.

## 5. Phase 3 — Seller fulfillment flow (MVP)

- Order review/confirm with per-line quantity adjustment, **each adjustment writing an audit entry** (who/when/old/new/reason) — built alongside the confirm action itself, not retrofitted.
- Status transitions through `PICKING → READY → OUT_FOR_DELIVERY → DELIVERED`.
- Seller-entered orders on behalf of a customer, including address selection (reuses Phase 2 domain logic).
- Notifications (in-app + email) on the transitions listed in [ORDER_WORKFLOW.md](ORDER_WORKFLOW.md) §6.
- Basic dashboard (order counts by status, top products).

*Milestone*: the MVP acceptance criteria in [MVP_SCOPE.md](MVP_SCOPE.md) §3 pass end-to-end with a design-partner seller's real catalog.

## 6. Phase 4 — Pilot hardening

- Audit log UI (read-only view for Seller Admin of their own tenant's history, including order adjustments).
- CSV export (orders, customers).
- Error tracking/observability wired up in production.
- Load-test the catalog browse path against a realistic SKU count.
- Run the pilot with 1–3 real seller tenants; expect the [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) list to shrink as real usage answers questions that were genuinely ambiguous pre-launch — including how much multi-membership and multi-unit usage actually shows up in practice.

## 7. Phase 5+ — Post-MVP (ordered roughly by expected demand, not commitment)

1. Role split: Sales Rep, Warehouse Worker, Delivery Driver, Buyer Employee (membership model already supports this).
2. Organization switcher UI, once real multi-membership usage appears.
3. Buyer-side internal approval workflow.
4. Hard order cut-off enforcement (tenant/customer/route-specific).
5. Return/Claim entity and workflow (built on the preserved `confirmedQty`/`deliveredQty` data).
6. Promotions engine beyond flat discount.
7. Multiple/scheduled price lists per customer.
8. Credit limit / payment terms enforcement.
9. Public API.
10. ERP/accounting integration.
11. Self-serve tenant signup + SaaS subscription billing (`Tenant.subscriptionPlan`/`subscriptionStatus` already exist as placeholders).
12. Delivery route planning.
13. Multi-currency per tenant.
14. Native mobile app — only if PWA/responsive web proves insufficient in the pilot.
15. On-premise/self-hosted deployment — only if a specific customer contractually requires it.

## 8. Testing strategy

- Unit tests on `lib/domain/*` (order state machine, price resolution, min-qty/increment validation, snapshot generation, audit-entry writing).
- Integration tests on the tenant-isolation boundary, including the multi-membership case, run on every PR touching data access.
- End-to-end tests for the golden paths: buyer places an order with a selected address; seller confirms with an adjustment and fulfills it; a reorder/re-view of a delivered order shows the original snapshot even after the catalog changes.
- No prescribed 100% coverage target — coverage follows from testing the domain layer, snapshot integrity, and isolation boundary thoroughly.

## 9. Team/process notes

- A single small team (1–3 engineers) can execute Phases 0–3 sequentially; parallelizing Phase 1 (seller tools) and Phase 2 (buyer flow) across two people is reasonable once Phase 0's foundations — especially the RLS/pooling verification and the snapshot/audit conventions — are in place.
- Treat the first real seller tenant as a design partner: their actual catalog structure (how many packaging options per product, how many delivery addresses per customer), pricing quirks, and delivery patterns will surface gaps in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) faster than further up-front analysis would.

## 10. Change history

- **2026-09-19 — initial documentation set.**
- **2026-09-19 — locked business-rules review**: replaced `SellerUser`/`CustomerUser` with a unified `User` + `TenantMembership`/`CustomerMembership` model; confirmed RLS enabled from day one (not deferred); added `ProductUnit` (multi-packaging), `CustomerAddress` (multi-address with order-time snapshotting), full order-line snapshotting (name/SKU/unit/price/discount/VAT), per-product VAT override, soft-warning cut-off time, and `Tenant.subscriptionPlan`/`subscriptionStatus` placeholders. See the individual documents' revision notes for details; superseded content is not preserved in-repo beyond this log.
