# Database Design

Database: PostgreSQL. ORM: Prisma. This document describes the conceptual/logical model; exact Prisma schema syntax is illustrative, not final.

> **Revision note**: this version supersedes the original draft's `SellerUser`/`CustomerUser` split in favor of a unified `User` + Membership model (see §4 for the full rationale — this was an explicit architectural review requested before implementation). It also adds multi-unit/packaging support, multi-address support with order-time snapshotting, and fuller historical snapshotting on orders, per locked MVP business rules.

## 1. Multi-tenancy strategy

**Shared database, shared schema, `tenantId` column on every tenant-owned table, enforced by PostgreSQL Row-Level Security (RLS) in addition to application-level filtering — both enabled from day one.** This was explicitly re-reviewed (see [SECURITY_AND_MULTI_TENANCY.md](SECURITY_AND_MULTI_TENANCY.md) §2 for the "RLS now vs. later" decision) and reaffirmed rather than weakened: RLS setup is a bounded, one-time cost, not ongoing complexity, and tenant isolation was named as the non-negotiable requirement.

Rejected alternatives (unchanged from original review): database-per-tenant (operationally heavy at this stage), schema-per-tenant (poor fit for Prisma's migration model), app-code-only filtering with no RLS (single point of failure).

`tenantId` always refers to the **Seller's** id (the `Tenant` row). Buyer-side tables (`Customer`, memberships, orders) are scoped by `tenantId` too — a `Customer` belongs to exactly one `Tenant`.

## 2. Entity overview

```
Tenant (Seller company)
 ├─ TenantMembership (User ↔ Tenant, role: SELLER_ADMIN | SALES_REP | WAREHOUSE_WORKER | DELIVERY_DRIVER)
 ├─ Category
 ├─ UnitOfMeasure
 ├─ Product ── belongs to Category
 │   └─ ProductUnit (a sellable packaging/unit option for this product)
 ├─ PriceList
 │   └─ PriceListItem (ProductUnit + price)
 ├─ Customer (Buyer company)
 │   ├─ CustomerMembership (User ↔ Customer, role: BUYER_ADMIN | BUYER_EMPLOYEE)
 │   ├─ CustomerAddress (one or more delivery/billing addresses)
 │   ├─ CustomerPriceListAssignment
 │   ├─ CustomerProductVisibility
 │   ├─ FavoriteList / FavoriteListItem
 │   └─ Order
 │       └─ OrderLine (ProductUnit + full snapshot fields, see §6)
 ├─ DeliveryRoute (Phase 2 usage; table exists for future extensibility)
 └─ AuditLogEntry

User (global identity, not tenant-scoped)
 ├─ TenantMembership[]     (zero, one, or more — see §4)
 └─ CustomerMembership[]   (zero, one, or more — see §4)
```

`Tenant` and `User` are the only entities not themselves scoped by a single `tenantId` — `User` is global identity; a person's *access* to a tenant or customer comes entirely through their membership rows, which **are** tenant-scoped.

## 3. Core entities (fields, non-exhaustive)

### Tenant
`id, name, slug, status (ACTIVE/SUSPENDED), defaultCurrency, defaultVatRate, cutOffTime (nullable, e.g. "14:00"), cutOffEnforcement (SOFT_WARNING | HARD_BLOCK — MVP always SOFT_WARNING, field exists for Phase 2 per-tenant hard cut-offs), locale, subscriptionPlan (nullable string, unused MVP), subscriptionStatus (nullable enum, unused MVP), createdAt`

### User (global identity)
`id, email (globally unique), passwordHash, name, locale, isPlatformAdmin (boolean), isActive, createdAt`

One row per person, regardless of how many tenants/customers they're associated with. Authentication (login, password reset, sessions) operates on this table alone.

### TenantMembership (Seller-side access grant)
`id, userId, tenantId, role (SELLER_ADMIN | SALES_REP | WAREHOUSE_WORKER | DELIVERY_DRIVER), isActive, createdAt` — unique on `(userId, tenantId)`.

### CustomerMembership (Buyer-side access grant)
`id, userId, customerId, tenantId (denormalized — see §5), role (BUYER_ADMIN | BUYER_EMPLOYEE), isActive, createdAt` — unique on `(userId, customerId)`.

### Customer (Buyer company)
`id, tenantId, name, taxId (ЕДБ), discountPercent (nullable), creditLimit (nullable, stored not enforced), paymentTermsDays (nullable, stored not enforced), allowedDeliveryDays (int[] weekday mask), isActive, createdAt`

Billing/delivery addresses are no longer inline fields on `Customer` — see `CustomerAddress` below (locked rule: a buyer company may have multiple delivery addresses). Price list assignment is **not** a field on `Customer` either — see `CustomerPriceListAssignment` below; an earlier draft of this document listed `defaultPriceListId` here too, which directly contradicted that table's own rationale ("not a single FK on Customer"). The table wins; this was corrected during Phase 0 implementation.

### CustomerAddress
`id, customerId, tenantId (denormalized), label (e.g. "Main warehouse", "Downtown branch"), recipientName, addressLine1, addressLine2, city, postalCode, country, isDefaultDelivery, isDefaultBilling, isActive, createdAt`

A `Customer` has one or more `CustomerAddress` rows. Deactivating an address (`isActive = false`) hides it from future selection without touching historical orders, which store a full snapshot (§6), not a live FK dependency.

### Category
`id, tenantId, name, parentCategoryId (nullable), sortOrder`

### UnitOfMeasure
`id, tenantId, code (e.g. "pc", "box", "kg"), label`

A tenant-level catalog of unit types (piece, box, kg, carton, ...). Not tied to a single product — reused across `ProductUnit` rows.

### Product
`id, tenantId, categoryId, name, description, imageUrl, defaultVatRate (nullable — falls back to `Tenant.defaultVatRate` when null; locked rule: product-specific VAT override must be supported), isActive, createdAt`

Note: `Product` no longer carries a single `unitOfMeasureId`, `sku`, `minOrderQty`, or `orderIncrement` directly — those now live on `ProductUnit`, because the same product is commonly sold in more than one packaging (piece vs. box vs. kg), each with its own SKU, min quantity, increment, and potentially its own price (see §7).

### ProductUnit (sellable packaging/unit option)
`id, tenantId, productId, unitOfMeasureId, sku, label (e.g. "Box of 12", "1kg bag"), conversionFactorToBase (nullable — e.g. 12 pieces per box, for future stock/reporting use), minOrderQty, orderIncrement, isDefault, isActive, createdAt`

Every `Product` has **at least one** `ProductUnit` (MVP: sellers typically create just one at first — "simplified subset" — but the schema never assumes there's only ever one). `isDefault` marks which `ProductUnit` pre-selects in the buyer UI when a product has more than one.

### PriceList
`id, tenantId, name, currency, isDefault, createdAt`

### PriceListItem
`id, priceListId, productUnitId, price` — unique on `(priceListId, productUnitId)`. Pricing is per packaging option, not per product, since a box and a single piece of the same product legitimately have different (non-linearly-related) prices.

### CustomerPriceListAssignment
`id, customerId, priceListId, effectiveFrom (nullable, unused MVP)` — unique on `customerId` for MVP (exactly one active assignment); relaxing this to allow multiple time-bound rows per customer in Phase 2 is a cheap constraint change, not a column migration.

### CustomerProductVisibility
`id, customerId, productId, visibility (HIDDEN | VISIBLE)` — visibility stays product-level (not per-packaging); absence of a row = visible by default.

### FavoriteList / FavoriteListItem
`FavoriteList: id, customerId, createdByUserId, name` · `FavoriteListItem: id, favoriteListId, productUnitId, defaultQty`

### Order
`id, tenantId, customerId, orderNumber (per-tenant sequence), status, placedByUserId, placedByName (snapshot), placedByRole (snapshot), deliveryAddressId (FK, nullable if address later deleted), deliveryAddressSnapshot (JSON: recipientName/addressLine1/2/city/postalCode/country — see §6), requestedDeliveryDate, cutOffWarningShown (boolean — whether the soft cut-off warning was shown at submission), note, cancelledBy (BUYER | SELLER | SYSTEM), cancelReason, deliveredWithIssues, deliveredWithIssuesNote, createdAt, submittedAt, confirmedAt, deliveredAt`

### OrderLine
`id, orderId, productUnitId, productNameSnapshot, productSkuSnapshot, unitLabelSnapshot, requestedQty, confirmedQty (nullable), deliveredQty (nullable), unavailableReason (nullable), unitPriceAtOrderTime, discountPercentAtOrderTime (nullable), vatRateAtOrderTime`

Per locked rule C, every value that could plausibly change later on the catalog/customer side is snapshotted onto the line at submission time: product name, SKU, unit label, unit price, discount, and VAT rate. A later rename of the product, a deleted `ProductUnit`, or a changed price list must never alter what a historical order shows. `productUnitId` is kept as a reference for convenience (e.g. "reorder this line"), but no display or financial value is ever read live through it for an existing order.

### AuditLogEntry
`id, tenantId, actorUserId, actingAsMembershipType (TENANT | CUSTOMER | PLATFORM_ADMIN — which "hat" the actor was wearing, relevant once a user can hold more than one membership, see §4), entityType, entityId, action, fieldName (nullable — set for granular field-level changes like a quantity adjustment), oldValue, newValue, reason (nullable), createdAt`

Per locked rule D, seller-side adjustments to a submitted order (confirming a different quantity than requested, marking a line unavailable, cancelling) must each write an `AuditLogEntry` with the actor, timestamp, old value, new value, and reason where applicable — not just a mutated `OrderLine` row. Example: a seller reducing `confirmedQty` from 10 to 6 on a line writes `{entityType: "OrderLine", fieldName: "confirmedQty", oldValue: "10", newValue: "6", reason: "OUT_OF_STOCK"}` in addition to updating the line itself.

### DeliveryRoute *(placeholder table, not exposed beyond a flat list in MVP UI)*
`id, tenantId, name, deliveryDays (int[] weekday mask)`

## 4. User model: separate SellerUser/CustomerUser tables vs. unified User + Membership — decision

**Decision: unified `User` table + `TenantMembership` + `CustomerMembership` join tables.** This replaces the original draft's separate `SellerUser`/`CustomerUser` tables.

### The tradeoff

| | Separate SellerUser/CustomerUser (original draft) | Unified User + Membership (adopted) |
|---|---|---|
| Tenant scoping | Structural — a row's table tells you which side it's on | Structural on the *membership* row, not the identity row — equally hard to get wrong once queries go through memberships, not `User` directly |
| One person, multiple organizations | Not supported without duplicating the person as two separate rows with two separate passwords — actively wrong once it happens | Native: one `User`, many `TenantMembership`/`CustomerMembership` rows |
| Login/password reset | Two different lookup paths depending on which table the email is in (or an ambiguous email across both) | One lookup path by email, always |
| Future SSO / "log in once, work across a firm's multiple customer accounts" | Requires a rearchitecture | Already the natural shape |
| Query simplicity for "give me this tenant's users" | Direct table scan | One join through `TenantMembership` — trivial, and it's the join you want anyway since a membership also carries the role |
| Risk of scope-checking bugs | Low, by construction | Low, by construction — the isolation guarantee moves from "which table" to "which membership row(s) are active for this session," enforced the same way (denormalized `tenantId` on `CustomerMembership`, RLS on all membership and tenant-owned tables) |

### Why the change

The original design chose separate tables specifically to make scoping a schema-level fact rather than a runtime check. That reasoning was sound in isolation, but it implicitly assumed a person belongs to exactly one organization forever — an assumption this review was explicitly asked to challenge, and one that doesn't hold for a "long-term commercial multi-tenant SaaS": a bookkeeper or consultant working across multiple seller tenants, a person who is staff at one distributor and also a buyer for their own side business, or simply an employee who changes employer but should keep their login history, are all realistic over a multi-year product life. Modeling identity and organizational access as separate concepts (`User` vs. `Membership`) is the standard, well-proven pattern for this (Slack, GitHub, Linear, Vercel all do this), and it does not weaken tenant isolation as long as **all data access is scoped through the membership row, never through `User` directly** — which is how Layer 2/3 enforcement is specified in [SECURITY_AND_MULTI_TENANCY.md](SECURITY_AND_MULTI_TENANCY.md).

`Order.placedByUserId` now references `User` directly (no discriminator table needed, since there's only one `User` table); `placedByName`/`placedByRole` are snapshotted onto the order for the same historical-integrity reason as everything else in §6, since a membership (and its role) can change or be revoked after an order was placed.

### Session/active-context implication

A session now resolves to an **active membership**, not just a user: at login, if a `User` has exactly one membership (the expected MVP case — most people will have exactly one), it's auto-selected. If they have more than one, the session must let them pick which organization context they're acting in (an "org switcher," Phase 2 UI — see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)). The session's `tenantId` (used for RLS, see [SECURITY_AND_MULTI_TENANCY.md](SECURITY_AND_MULTI_TENANCY.md) §3) is always derived from the **active membership**, never from the user directly.

`isPlatformAdmin` stays a simple boolean flag on `User` rather than a third membership type — platform administration isn't scoped to an organization, and in practice is granted to a small, fixed set of internal staff; a full membership abstraction would be overhead for a case that doesn't need multiplicity.

## 5. `tenantId` denormalization

`CustomerMembership`, `CustomerAddress`, `Order`, `OrderLine` (via Order), `AuditLogEntry` all carry `tenantId` directly even though it's technically derivable via a join. Unchanged rationale from the original design: RLS policies filter on a column that exists directly on the row being read, keeping policies simple and index-friendly.

## 6. Historical snapshotting — full list

Per locked rule C, every one of the following is captured at order-submission time and never re-derived from live catalog/customer data:

| What | Where stored | Why it can change later |
|---|---|---|
| Product name & SKU | `OrderLine.productNameSnapshot`, `productSkuSnapshot` | Seller renames/re-codes a product |
| Unit/packaging label | `OrderLine.unitLabelSnapshot` | Seller edits or deactivates a `ProductUnit` |
| Unit price | `OrderLine.unitPriceAtOrderTime` | Price list changes |
| Discount | `OrderLine.discountPercentAtOrderTime` | Customer discount changes |
| VAT/tax rate | `OrderLine.vatRateAtOrderTime` | Product or tenant default VAT rate changes |
| Delivery address | `Order.deliveryAddressSnapshot` (JSON) + `deliveryAddressId` (reference only) | Buyer edits or removes a saved address |
| Who placed the order & their role | `Order.placedByName`, `placedByRole` | Membership/role changes or is revoked later |

## 7. Indexing notes

- Every tenant-scoped table: composite index leading with `tenantId` (e.g. `(tenantId, status)` on `Order`, `(tenantId, categoryId)` on `Product`).
- `TenantMembership`: unique `(userId, tenantId)`, index on `(tenantId, isActive)` for "list this tenant's staff."
- `CustomerMembership`: unique `(userId, customerId)`, index on `(tenantId, customerId, isActive)`.
- `Order.orderNumber`: unique on `(tenantId, orderNumber)`, per-tenant sequence.
- `PriceListItem`: unique on `(priceListId, productUnitId)`.
- `ProductUnit`: unique on `(tenantId, sku)`.
- `CustomerProductVisibility`: unique on `(customerId, productId)`.
- `CustomerAddress`: index on `(customerId, isActive)`.

## 8. What is deliberately NOT modeled yet

- Payment/invoice/ledger entities (accounting stays out of scope).
- Stock/inventory quantities (no ERP/WMS feed exists; `unavailableReason` on `OrderLine` is a manual seller action).
- A full `Return`/`Claim` entity — MVP keeps `Order.deliveredWithIssues` + note, but `OrderLine.deliveredQty` already exists alongside `confirmedQty`, so a Phase 2 return entity can diff "confirmed vs. delivered vs. returned" without adding fields retroactively to historical orders.
- Billing/subscription logic — `Tenant.subscriptionPlan`/`subscriptionStatus` are unused placeholders in MVP.
