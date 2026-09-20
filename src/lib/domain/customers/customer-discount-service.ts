import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";

/**
 * MVP discount rule (locked, see docs/MVP_SCOPE.md and the Phase 1B brief):
 * a single flat percentage per customer, applied AFTER the base price-list
 * price - see pricing-resolution.ts for exactly where this is applied.
 * `null` clears the discount back to "none" (0%, i.e. full price-list price).
 */
export async function setCustomerDiscountInTx(
  tx: ScopedTransactionClient,
  tenantId: string,
  actorUserId: string,
  customerId: string,
  discountPercent: number | null,
  reason = "Discount changed"
) {
  const before = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
  const after = await tx.customer.update({ where: { id: customerId }, data: { discountPercent } });

  await writeAuditLogEntry(tx, {
    tenantId,
    actorUserId,
    actingContext: "TENANT",
    entityType: "Customer",
    entityId: customerId,
    action: "UPDATE",
    oldValue: { discountPercent: before.discountPercent },
    newValue: { discountPercent: after.discountPercent },
    reason,
  });
  return after;
}

export async function setCustomerDiscount(
  tenantId: string,
  actorUserId: string,
  customerId: string,
  discountPercent: number | null
) {
  return withTenantContext(tenantId, (tx) => setCustomerDiscountInTx(tx, tenantId, actorUserId, customerId, discountPercent));
}
