# Open Questions

Unresolved business decisions that should be answered before or during MVP build-out — grouped by area. Items resolved by the 2026-09-19 locked business-rules review have been removed from this list (see change history in [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) if you need the prior version); this list is the current, live set.

## Ordering & pricing rules

1. **What happens to a customer-specific price if the underlying price list price changes** after an order is submitted but before it's confirmed? (Current design snapshots price at submission — confirm this matches business expectations, especially for volatile pricing like produce.)
2. **Are discounts stackable** (customer flat discount + a future promotion), or does the more specific one always win? Not urgent for MVP (only flat discount exists) but affects the Phase 2 promotions data model.
3. **Minimum order value** (not just per-line min qty) — does a seller ever require a minimum total order value before submission is allowed?
4. **Payment terms display** — MVP stores `paymentTermsDays` on `Customer` without enforcing it; should it at least be *displayed* on the order/confirmation screen so both sides have a shared reference, even though nothing blocks on it?

## Delivery

5. **Who owns delivery-day/route assignment in MVP** — is it purely informational (buyer picks from a fixed weekday list) or does it need to map to actual driver capacity? Affects whether `DeliveryRoute` needs any real logic in MVP or stays a placeholder table.

## Roles & multi-user

6. **How many sellers realistically need Sales Rep / Warehouse / Driver role separation at launch**, versus how many will run fine with a single Seller Admin login for MVP? Determines how soon Phase 5's role split needs to move up in priority.
7. **How real is the multi-membership scenario** (one person with `TenantMembership`/`CustomerMembership` at more than one organization) likely to be in the actual target market, and on what timeline? The schema supports it from day one (see [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §4), but the org-switcher UX is only worth building once there's a concrete case — worth checking with early design-partner sellers rather than guessing.
8. **Should granting `isPlatformAdmin` require its own approval/audit step** even in MVP, given it's a single boolean with full platform reach and a small mistake here has an unusually large blast radius?

## Returns & disputes

9. **How common and how granular are returns in practice** — whole-order refusals, or routine partial returns (damaged crate, wrong item)? `OrderLine` already carries `confirmedQty` and `deliveredQty` so a Phase 2 Return/Claim entity can diff against real fulfillment data, but the granularity of the *return* itself (per-line? per-unit-of-measure? with photos/reason codes?) still needs a real design pass.

## Catalog & units of measure

10. **How many packaging options does a typical product realistically need at launch** — the schema (`ProductUnit`) supports any number per product, but how much of that should MVP's catalog-editing UI expose up front vs. add once a seller actually asks for a second unit on a product?
11. **Do sellers need product bundles/kits** (a fixed combination of products sold as one line item)? Not currently modeled at all.
12. **`ProductUnit` deprecation UX**: when a seller deactivates a packaging option that has live `PriceListItem`s or is a customer's favorite, what should the catalog-editing UI do (block, warn, cascade-deactivate)? Historical orders are unaffected either way (snapshotted), so this is a UX question, not a data-integrity one.

## Platform/commercial

13. **What is the actual SaaS pricing model** (per seller flat fee, per order volume, per active buyer seat)? `Tenant.subscriptionPlan`/`subscriptionStatus` exist as placeholder fields; the real values/logic depend on this answer.
14. **Is single sign-on (SSO) likely to be requested** by larger buyer or seller organizations early enough to move the Auth.js-vs-hosted-IdP decision in [ARCHITECTURE.md](ARCHITECTURE.md) up the roadmap?

## Localization & compliance

15. **Beyond UI translation, are there Macedonia-specific invoicing/fiscalization requirements** (e.g., fiscal receipt integration) that a future accounting/ERP integration must account for, even though MVP doesn't touch invoicing directly?

## Product/UX

16. **Reorder semantics**: if a past order's product is now discontinued, out of visibility for that customer, has changed price, or its `ProductUnit` was deactivated, what should "reorder" show the buyer — silently drop it, flag it, or block the reorder until resolved?

## Infrastructure (raised by the RLS/hosting review)

17. **Connection pooling compatibility**: RLS enforcement depends on setting a Postgres session variable (`app.current_tenant_id`) per request via `SET LOCAL` inside a transaction (see [SECURITY_AND_MULTI_TENANCY.md](SECURITY_AND_MULTI_TENANCY.md) §2). This must be verified against the actual chosen managed Postgres provider and connection-pooling mode (session vs. transaction pooling — e.g. PgBouncer in transaction mode can break `SET LOCAL` visibility) **before** committing to a specific hosting plan in Phase 0, not discovered during production hardening.
