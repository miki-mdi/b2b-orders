/**
 * Two tiers of row-level scoping, matching the two tiers of isolation this
 * platform actually promises (docs/SECURITY_AND_MULTI_TENANCY.md §1):
 *
 *  - Tenant isolation: Seller A must never see Seller B's data. This is the
 *    platform's core sellable guarantee and applies to every table below.
 *  - Customer isolation: within one Seller, Buyer Company A must never see
 *    Buyer Company B's data. This only applies to the subset of tables a
 *    buyer session ever touches.
 *
 * Both are enforced at two independent layers - see ./scoped-client.ts
 * (Layer 2, application) and prisma/rls/policies.sql (Layer 3, database).
 */

export const TENANT_SCOPED_MODELS = [
  "TenantMembership",
  "CustomerMembership",
  "Category",
  "UnitOfMeasure",
  "Product",
  "ProductUnit",
  "PriceList",
  "Customer",
  "CustomerAddress",
  "DeliveryRoute",
  "Order",
  "AuditLogEntry",
] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

export function isTenantScopedModel(model: string): model is TenantScopedModel {
  return (TENANT_SCOPED_MODELS as readonly string[]).includes(model);
}

/**
 * Models with their own `customerId` column. When a session is acting as a
 * buyer (an active customerId is present in the tenant context), these are
 * additionally filtered by customerId - not just tenantId - so one buyer
 * company can never read another's rows even though they share a tenantId.
 */
export const CUSTOMER_SCOPED_MODELS = [
  "CustomerMembership",
  "CustomerAddress",
  "CustomerPriceListAssignment",
  "CustomerProductVisibility",
  "FavoriteList",
  "Order",
] as const;

export type CustomerScopedModel = (typeof CUSTOMER_SCOPED_MODELS)[number];

export function isCustomerScopedModel(model: string): model is CustomerScopedModel {
  return (CUSTOMER_SCOPED_MODELS as readonly string[]).includes(model);
}

/**
 * The Customer model is a special case: it IS the buyer company, so a buyer
 * session scopes it by its own `id`, not by a `customerId` column. Applied
 * only to read/update/delete - a buyer session never creates Customer rows
 * (only sellers do, via withTenantContext with no customerId set, where this
 * branch never fires).
 */
export const CUSTOMER_SELF_SCOPED_MODEL = "Customer";
