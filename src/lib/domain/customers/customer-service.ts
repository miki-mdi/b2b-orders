import { withTenantContext } from "@/lib/db/with-tenant";

/**
 * Minimal seller-side domain functions, provided at Phase 0 only to prove
 * the tenant-scoping pattern end-to-end (used directly by the isolation
 * tests in tests/isolation/). Full customer management is Phase 1 - see
 * docs/DEVELOPMENT_PLAN.md.
 */

export function listCustomers(tenantId: string) {
  return withTenantContext(tenantId, (tx) => tx.customer.findMany({ orderBy: { name: "asc" } }));
}

export function getCustomerById(tenantId: string, customerId: string) {
  return withTenantContext(tenantId, (tx) => tx.customer.findUnique({ where: { id: customerId } }));
}
