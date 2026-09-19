# MVP Scope

Goal: the smallest system that lets **one seller** fully replace phone/chat ordering with **real customers**, proving the core loop (seller sets up catalog + prices → buyer orders → seller fulfills). Multi-tenant *infrastructure* (isolation, membership model) is built from day one because retrofitting it later is dangerous; multi-tenant *operational tooling* (self-serve tenant signup, billing) is not.

> **Revision note**: updated to reflect the locked business-rule decisions from the 2026-09-19 review. Several items that were previously "out of scope" are now in scope in a deliberately simplified form (cut-off warning, multiple delivery addresses, per-product VAT); others remain deferred exactly as before (credit enforcement, full returns, buyer approval workflow, billing, on-prem).

## 1. In scope for MVP

### Platform Admin
- Manually create a tenant (seller company) and its first Seller Admin membership.
- Suspend/reactivate a tenant.
- No cross-tenant reporting UI beyond a simple tenant list at MVP.

### Seller
- Manage customers (create/edit/deactivate), their memberships, and their **delivery/billing addresses** (a customer may have more than one; MVP UI supports adding, editing, and deactivating addresses).
- Manage categories, products, and **one or more packaging/unit options per product** (`ProductUnit` — e.g. piece and box for the same item), each with its own SKU, min order qty, and order increment. MVP UI keeps this simple (most products will just have one), but the data model and UI both support more than one from day one.
- Set a **default VAT rate per tenant**, with an optional **override per product** where it differs.
- One price list per tenant, priced per packaging option, plus the ability to assign a **customer-specific price list**. Multiple simultaneous price lists per customer, tiered pricing, and scheduled price changes remain Phase 2.
- Per-customer product visibility (allow/deny list) and a flat percentage discount per customer (optional). Promotions/campaigns remain Phase 2.
- Configure a **cut-off time** (soft warning only — see below).
- Receive and review submitted orders; confirm with per-line quantity adjustment (every adjustment audited: who, when, old/new value, reason); mark lines unavailable.
- Move orders through `PICKING → READY → OUT_FOR_DELIVERY → DELIVERED` (manual status buttons; no barcode scanning, no route optimization).
- Create an order on behalf of a customer, including selecting one of that customer's saved addresses.
- Import products and customers via CSV. Export orders to CSV.
- Basic dashboard: orders by status, today's/this week's order count and value, top 10 products.
- Full order history and per-customer purchase history.

### Buyer
- Log in, see only their tenant's catalog and their own prices.
- Browse by category, search by name.
- Add to cart respecting per-packaging min order qty / increment; submit order with a note.
- **Select a delivery address from their company's saved addresses** (and a Buyer Admin can manage those addresses).
- Select a delivery date from allowed delivery days; if past the tenant's configured cut-off, see a **non-blocking warning**, not a hard stop.
- **Cannot edit a submitted order.** May request cancellation while it is still `SUBMITTED` (resolves immediately, no approval needed at that stage).
- View order status and history; reorder a past order into the cart; maintain a favorites list.
- Single role (`BUYER_ADMIN`) — no per-employee permission tiers or internal approval workflow yet (locked: not in MVP).

### Cross-cutting
- Auth (email/password) on a single global `User` identity; role/scope resolved through an **active membership** (`TenantMembership` or `CustomerMembership`); full tenant data isolation enforced at both the application layer and PostgreSQL RLS, both live from day one.
- Every order carries a full historical snapshot (product name/SKU, unit label, price, discount, VAT rate, delivery address) so later catalog or address edits never alter a past order.
- Macedonian + English UI.
- Audit log of order status changes, seller quantity adjustments, and price/visibility changes.
- Responsive web UI usable on mobile browsers (no native app, no offline mode).
- Cloud-hosted only (managed Postgres + Node hosting); no on-premise deployment work.

## 2. Explicitly out of scope for MVP (Phase 2+)

| Feature | Why deferred |
|---|---|
| Self-serve tenant signup + SaaS billing | `Tenant.subscriptionPlan`/`subscriptionStatus` exist as placeholders only; needs a validated pricing model first (see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)) |
| Sales Rep / Warehouse / Driver / Buyer Employee roles | Membership model supports adding these without a schema change; MVP ships with one role per side |
| Buyer-side internal approval workflow | Locked as not-in-MVP regardless of role split |
| Organization switcher UI (for a person with multiple memberships) | The data model supports multiple memberships per user from day one; the switcher UI is built once real multi-membership usage appears |
| Multiple price lists per customer, scheduled pricing, tiered/volume pricing | One active price list per customer covers the common case |
| Promotions engine (BOGO, threshold discounts, campaigns) | Flat per-customer discount is enough to validate the model |
| Delivery route planning/optimization | MVP delivery is "mark dispatched, mark delivered"; `DeliveryRoute` stays a placeholder table |
| Credit limit / payment terms **enforcement** | Fields are stored on `Customer` for future use; MVP never blocks or warns based on them (locked: no accounting logic in MVP) |
| Hard order cut-off enforcement (tenant/customer/route-specific) | MVP is soft-warning only; `Tenant.cutOffEnforcement` exists so hard blocking is a config/logic change later, not a migration |
| Real-time stock availability integration | No ERP/WMS integration exists yet; sellers mark items unavailable manually at confirmation |
| Full Return/Claim workflow | MVP has `deliveredWithIssues` + a note only; `OrderLine.deliveredQty` is preserved so Phase 2 can build a proper line-level return entity without back-filling historical orders |
| Multi-currency per tenant | Schema supports per-price-list currency; MVP UI assumes one currency per tenant |
| Public API | Internal API only (used by the Next.js app itself) |
| ERP/accounting integration | Explicitly deferred; snapshotting in the order model keeps this from blocking it later |
| Native mobile app | PWA/responsive web only until there's evidence native is required |
| Notifications beyond in-app + email | SMS/WhatsApp/push deferred |
| On-premise / self-hosted deployment | MVP is cloud-first only (locked decision); not designed for on-prem now |

## 3. MVP acceptance criteria (end-to-end)

The MVP is "done" when, for one seller tenant with real data:
1. A Seller Admin can, without developer help, add a customer with at least one delivery address, assign it a price list, and add/import products with at least one packaging option each.
2. A Buyer can log in, see only that tenant's products at their negotiated prices, and submit an order — selecting a saved delivery address — that respects min-qty/increment rules, with a non-blocking cut-off warning shown when applicable.
3. A Seller Admin can confirm the order with at least one quantity adjustment on one line, and that adjustment is visible in the audit log with who/when/old/new/reason, then move the order through to `DELIVERED`.
4. The Buyer sees the status changes and the adjusted quantities without calling anyone, and cannot edit the order after submission.
5. Re-opening that delivered order later still shows the original product name, price, discount, VAT rate, and delivery address exactly as they were at submission — even after the seller edits the underlying product, price, or address afterward.
6. A second tenant, created independently, cannot see any data belonging to the first tenant — verified by an automated isolation test suite (including a test user with memberships in both tenants), not manual spot-checking (see [SECURITY_AND_MULTI_TENANCY.md](SECURITY_AND_MULTI_TENANCY.md) §9).
