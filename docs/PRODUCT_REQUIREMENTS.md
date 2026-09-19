# Product Requirements Document (PRD)

## 1. Vision

Replace ad-hoc B2B ordering (phone calls, Viber/WhatsApp, paper notes, sales reps manually collecting orders) with a structured, self-service, multi-tenant ordering platform. Each **Seller** (distributor/wholesaler/manufacturer) runs its own storefront-like ordering experience for its **Buyers** (business customers), with customer-specific catalogs, pricing, and order workflows. The platform is built to be sold as SaaS to many independent sellers, not as a bespoke system for one company.

## 2. Problem Statement

Sellers currently lose time and accuracy collecting orders manually:
- Orders arrive in unstructured channels (calls, chat apps), causing transcription errors.
- Sales reps spend hours per day relaying orders instead of selling.
- Buyers cannot see accurate stock, price, or order status without calling.
- Sellers cannot easily enforce customer-specific pricing, minimum quantities, or credit terms.
- There is no audit trail of who ordered what, when, and what was actually delivered.

## 3. Personas

| Persona | Description | Primary goals |
|---|---|---|
| Platform Admin | Operates the SaaS platform itself (not a distributor) | Onboard/suspend seller tenants, monitor platform health, support |
| Seller Admin | Owner/manager at a distributor company | Configure catalog, prices, customers; oversee orders and delivery |
| Sales Rep *(future role, MVP: covered by Seller Admin)* | Field sales person for a seller | Place orders on behalf of assigned customers, view own customers' history |
| Warehouse Worker *(future role)* | Picks/packs orders | See confirmed orders, mark items picked/unavailable |
| Delivery Driver *(future role)* | Delivers goods | See route/manifest, mark delivered |
| Buyer Admin | Manager at a business customer | Manage their company's users and addresses, place/approve orders, see all company orders |
| Buyer Employee *(future role, MVP: covered by Buyer Admin)* | Staff at a business customer who orders | Place orders within their permissions |

A single person may, in principle, hold access at more than one seller or buyer company (e.g. a consultant, or someone who changes employer over time) — see [USER_ROLES_AND_PERMISSIONS.md](USER_ROLES_AND_PERMISSIONS.md) §5 for how this is modeled without weakening tenant isolation.

See [USER_ROLES_AND_PERMISSIONS.md](USER_ROLES_AND_PERMISSIONS.md) for the full role model and what is implemented at MVP vs. later.

## 4. Functional Requirements by Role

### 4.1 Platform Admin
- Create, suspend, and configure seller tenants.
- View cross-tenant operational metrics without accessing tenant order/customer data content.
- Manage platform-level configuration (subscription plans, feature flags — Phase 2).
- Impersonate/support a tenant only through an explicit, audited support-access mechanism (Phase 2).

### 4.2 Seller / Distributor
- Manage customers (business accounts), their users, and their **delivery/billing addresses** (a customer may have more than one).
- Manage product catalog: products, categories, **one or more packaging/unit options per product** (e.g. piece, box, carton, kg), images, descriptions.
- Manage pricing: price lists (priced per packaging option), per-customer price list assignment, per-customer discounts, promotions.
- Configure a **default VAT/tax rate**, with the ability to **override it per product** where a different rate applies.
- Configure which products are visible/orderable per customer.
- Configure an order **cut-off time** (MVP: shown to buyers as a warning, not enforced).
- Receive, review, and confirm orders; adjust quantities against stock; mark items unavailable — every such change is recorded with who/when/old value/new value/reason.
- Track orders through picking, ready, dispatch, delivery.
- Manage delivery routes/days (structured in MVP schema; route optimization is Phase 2+).
- Create orders on behalf of customers, including selecting the customer's delivery address.
- Import/export products, prices, and customers via Excel/CSV.
- View dashboards: order volume, top products, top customers, pending actions.
- View full order and customer purchase history, with each historical order showing exactly what was charged and shipped at the time — unaffected by later catalog or price changes.

### 4.3 Buyer / Customer
- Log in securely and see only their own seller's catalog and their own negotiated prices.
- Browse by category and search products.
- See unit of measure/packaging, minimum order quantity, and order increment per product.
- Add items to a cart, submit an order, attach an order note.
- Select a delivery date if the seller allows it, and select a **delivery address from their company's saved addresses**.
- Cannot edit an order once submitted; may request cancellation while it is still awaiting seller review.
- Track order status in real time.
- View past orders and reorder with one action.
- Maintain a favorites/frequently-ordered list.
- (Buyer Admin) Manage users and addresses within their own company and see all company orders, not just their own.

## 5. Non-Functional Requirements

- **Tenant isolation**: one seller must never be able to see another seller's data, under any code path, including bugs — enforced at both the application layer and the database layer (PostgreSQL RLS) from day one (see [SECURITY_AND_MULTI_TENANCY.md](SECURITY_AND_MULTI_TENANCY.md)).
- **Historical integrity**: an order must always reflect what was actually agreed and delivered at the time, regardless of later changes to products, prices, addresses, or customer records (see [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §6).
- **Auditability**: every order status change, every seller-side quantity adjustment, and every price/customer-visibility change must be attributable to a user and timestamped, with old/new values recorded.
- **Localization**: full UI in Macedonian and English at MVP.
- **Tax flexibility**: a tenant-level default VAT/tax rate, with the ability to override it per product.
- **Extensibility**: architecture must support a future public API, ERP integrations, SaaS billing, and additional roles without redesigning the core order/pricing/identity model.
- **Deployment**: cloud-hosted only at MVP; not designed for on-premise deployment.
- **Availability**: target 99.5% uptime post-launch, not required at MVP soft-launch.
- **Performance**: catalog browse and cart operations should feel instant (<300ms p95 for cached catalog reads) even as a seller's catalog grows to thousands of SKUs.
- **Device support**: responsive web app usable on desktop and mobile browsers; native mobile is out of scope until there's evidence it's needed.

## 6. Explicit Non-Goals (for now)

- Payments/checkout processing.
- Credit limit or payment-term enforcement (information is stored; nothing blocks on it).
- Route optimization algorithms.
- Real-time inventory sync with external WMS/ERP.
- Full Return/Claim workflow (MVP: a simple delivered-with-issues note).
- Native mobile apps.
- Full accounting/financial ledger functionality.
- SaaS subscription billing.
- On-premise/self-hosted deployment.

## 7. Glossary

| Term | Meaning |
|---|---|
| Tenant | A Seller/Distributor company subscribed to the platform |
| Customer | A Buyer business account belonging to one Tenant |
| User | A single global login identity, independent of any one organization |
| Membership | A grant of role-based access for a User within a specific Tenant (`TenantMembership`) or Customer (`CustomerMembership`) |
| Active membership | The organization/role context a session is currently acting under |
| Price List | A named set of product prices a Tenant can assign to one or more Customers |
| Product Unit | A sellable packaging/unit option for a Product (e.g. "piece", "box of 12"), each with its own SKU and price |
| SKU | A sellable product/unit-of-measure combination |
| Cut-off time | Time of day after which an order is flagged (MVP) or blocked (future) from being placed for a given delivery day |
| Confirmed quantity | The quantity the Seller commits to deliver, which may differ from the quantity the Buyer requested |
