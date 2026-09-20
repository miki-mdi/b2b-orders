import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";

export class CustomerNotFoundError extends Error {}
export class PriceListNotFoundError extends Error {}

async function assertCustomerBelongsToTenant(tx: ScopedTransactionClient, customerId: string) {
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new CustomerNotFoundError("Customer not found.");
  }
}

async function assertPriceListBelongsToTenant(tx: ScopedTransactionClient, priceListId: string) {
  const priceList = await tx.priceList.findUnique({ where: { id: priceListId } });
  if (!priceList) {
    throw new PriceListNotFoundError("Price list not found.");
  }
}

export function getCustomerPriceListAssignment(tenantId: string, customerId: string) {
  return withTenantContext(tenantId, (tx) =>
    tx.customerPriceListAssignment.findUnique({ where: { customerId }, include: { priceList: true } })
  );
}

/**
 * MVP: exactly one active assignment per customer, enforced by the
 * @@unique([customerId]) - see docs/DATABASE_DESIGN.md §3. Assigning a new
 * price list replaces the existing row (upsert); passing `priceListId: null`
 * clears the assignment entirely (the customer then has no resolvable
 * price list - see pricing-resolution.ts, which fails safe in that case).
 */
export async function setCustomerPriceListAssignment(
  tenantId: string,
  actorUserId: string,
  customerId: string,
  priceListId: string | null
) {
  return withTenantContext(tenantId, async (tx) => {
    await assertCustomerBelongsToTenant(tx, customerId);

    const before = await tx.customerPriceListAssignment.findUnique({ where: { customerId } });

    if (priceListId === null) {
      if (!before) {
        return null; // already unassigned - nothing to do, nothing to audit
      }
      await tx.customerPriceListAssignment.delete({ where: { customerId } });
      await writeAuditLogEntry(tx, {
        tenantId,
        actorUserId,
        actingContext: "TENANT",
        entityType: "CustomerPriceListAssignment",
        entityId: before.id,
        action: "DEACTIVATE",
        oldValue: before,
        reason: "Assignment cleared",
      });
      return null;
    }

    await assertPriceListBelongsToTenant(tx, priceListId);

    const after = await tx.customerPriceListAssignment.upsert({
      where: { customerId },
      create: { customerId, priceListId },
      update: { priceListId },
    });

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "CustomerPriceListAssignment",
      entityId: after.id,
      action: before ? "UPDATE" : "CREATE",
      oldValue: before,
      newValue: after,
    });
    return after;
  });
}
