# User Roles and Permissions

> **Revision note**: updated to reflect the unified `User` + Membership model adopted in [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §4, replacing the earlier separate `SellerUser`/`CustomerUser` design. The role catalog and permission matrix are unchanged in substance; what changed is *where the role lives*.

## 1. Design principle

A role is no longer a property of a user account itself — it's a property of that user's **membership** in a specific `Tenant` (via `TenantMembership.role`) or a specific `Customer` (via `CustomerMembership.role`). One `User` (a single global login identity) can in principle hold multiple memberships, each with its own role, in different organizations. `PLATFORM_ADMIN` remains the one exception: it's a flag on `User` itself (`isPlatformAdmin`), since platform administration isn't scoped to any single tenant.

MVP implements a subset of the roles below; the rest are designed-for but not built until Phase 2 — unchanged from the original plan.

## 2. Role catalog

| Role | Lives on | MVP? | Description |
|---|---|---|---|
| `PLATFORM_ADMIN` | `User.isPlatformAdmin` | Yes | Operates the SaaS platform; manages tenants |
| `SELLER_ADMIN` | `TenantMembership.role` | Yes | Full control of a seller's catalog, pricing, customers, orders |
| `SALES_REP` | `TenantMembership.role` | No (Phase 2) | Restricted to assigned customers; can place orders on their behalf, view their history |
| `WAREHOUSE_WORKER` | `TenantMembership.role` | No (Phase 2) | Sees confirmed orders queue; updates picking status only |
| `DELIVERY_DRIVER` | `TenantMembership.role` | No (Phase 2) | Sees assigned delivery manifest; marks dispatched/delivered |
| `BUYER_ADMIN` | `CustomerMembership.role` | Yes | Full control of their company's account: users, addresses, all orders, favorites |
| `BUYER_EMPLOYEE` | `CustomerMembership.role` | No (Phase 2) | Can place orders, limited to own orders and/or an approval workflow (locked as not-in-MVP, see [MVP_SCOPE.md](MVP_SCOPE.md)) |

At MVP, `SELLER_ADMIN` effectively holds all seller-side permissions, and `BUYER_ADMIN` holds all buyer-side permissions, so a company can operate with a single membership. Nothing about the schema assumes that stays true — adding `SALES_REP` or `BUYER_EMPLOYEE` later is a new membership row with a different role, not a new table.

## 3. Permission matrix (target state)

Legend: ✅ full access · ➖ scoped/partial · ❌ no access

| Capability | Platform Admin | Seller Admin | Sales Rep | Warehouse | Driver | Buyer Admin | Buyer Employee |
|---|---|---|---|---|---|---|---|
| Manage tenants | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage seller's customers & addresses | ❌ | ✅ | ➖ view own | ❌ | ❌ | ❌ | ❌ |
| Manage seller's products/units/prices | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create order on behalf of customer | ❌ | ✅ | ➖ own customers | ❌ | ❌ | ❌ | ❌ |
| Confirm/adjust orders (audited) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Update picking status | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Mark dispatched/delivered | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| View seller dashboards/reports | ❌ | ✅ | ➖ own customers | ❌ | ❌ | ❌ | ❌ |
| Import products/customers (CSV) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Browse catalog & place order | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Manage own company's users & addresses | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Request cancellation before confirmation | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ➖ own orders |
| View all company orders | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ➖ own only (unless granted) |

## 4. Tenant-scoping rule (non-negotiable, unchanged)

Every `TenantMembership` is scoped to exactly one `tenantId`. Every `CustomerMembership` is scoped to exactly one `customerId`, which itself belongs to exactly one `tenantId` (denormalized onto the membership row — see [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §5). All data queries are filterable — and enforced, per [SECURITY_AND_MULTI_TENANCY.md](SECURITY_AND_MULTI_TENANCY.md) — by that `tenantId`, regardless of role. `PLATFORM_ADMIN` is the only access level that spans tenants, and even then only for tenant-management data, not a tenant's commercial data, without explicit audited support access.

## 5. Multiple memberships and "active context"

Because a single `User` can hold more than one membership (e.g., theoretically a consultant with `TenantMembership` at two different sellers), a session must always resolve to exactly one **active membership** before any tenant-scoped action is authorized:

- **MVP**: the overwhelming majority of users will have exactly one membership; it's auto-selected at login and there is no switcher UI.
- **Phase 2+**: if/when multi-membership use becomes real (see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)), an explicit organization switcher is added — the session's active membership determines the `tenantId` used for RLS and all authorization checks for the remainder of that session (or until switched), exactly the same mechanism either way. This was designed in from day one specifically so it doesn't require a schema change when it's needed.

## 6. Authentication vs. authorization

- **Authentication**: who is this `User` (see [ARCHITECTURE.md](ARCHITECTURE.md) for the chosen auth technology) — identity only, no organizational context.
- **Authorization**: active membership's role + tenant/customer scope, checked on every request server-side. The UI hiding a button is a convenience, never the enforcement point.
