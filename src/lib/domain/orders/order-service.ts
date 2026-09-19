import { withCustomerContext, withTenantContext } from "@/lib/db/with-tenant";

/**
 * Minimal order read functions, provided at Phase 0 only to prove the
 * tenant- and customer-scoping patterns end-to-end (used directly by the
 * isolation tests in tests/isolation/). The order state machine, quantity
 * adjustments, and audit-log writing described in docs/ORDER_WORKFLOW.md are
 * Phase 3 - see docs/DEVELOPMENT_PLAN.md.
 */

/** Buyer-side: this customer's own orders only. */
export function listOrdersForCustomer(tenantId: string, customerId: string) {
  return withCustomerContext(tenantId, customerId, (tx) => tx.order.findMany({ orderBy: { createdAt: "desc" } }));
}

/** Buyer-side: one order, scoped to this customer - returns null if it belongs to another customer. */
export function getOrderForCustomer(tenantId: string, customerId: string, orderId: string) {
  return withCustomerContext(tenantId, customerId, (tx) => tx.order.findUnique({ where: { id: orderId } }));
}

/** Seller-side: one order across the whole tenant, regardless of which customer placed it. */
export function getOrderForTenant(tenantId: string, orderId: string) {
  return withTenantContext(tenantId, (tx) => tx.order.findUnique({ where: { id: orderId } }));
}
