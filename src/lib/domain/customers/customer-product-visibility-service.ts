import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";

export class CustomerNotFoundError extends Error {}
export class ProductNotFoundError extends Error {}

async function assertCustomerBelongsToTenant(tx: ScopedTransactionClient, customerId: string) {
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new CustomerNotFoundError("Customer not found.");
  }
}

async function assertProductBelongsToTenant(tx: ScopedTransactionClient, productId: string) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw new ProductNotFoundError("Product not found.");
  }
}

/**
 * All of the tenant's active products, each annotated with this customer's
 * visibility override (if any) - built for the seller UI's "hide/show per
 * product" table. Absence of an override means "visible by default", per
 * the resolution rule documented in pricing-resolution.ts.
 */
export async function listCustomerProductVisibility(tenantId: string, customerId: string) {
  return withTenantContext(tenantId, async (tx) => {
    const [products, overrides] = await Promise.all([
      tx.product.findMany({ where: { isActive: true }, orderBy: { nameEn: "asc" } }),
      tx.customerProductVisibility.findMany({ where: { customerId } }),
    ]);
    const overrideByProductId = new Map(overrides.map((o) => [o.productId, o.visibility]));
    return products.map((product) => ({
      product,
      visibility: overrideByProductId.get(product.id) ?? null, // null = no override, default visible
    }));
  });
}

/**
 * `visibility: null` removes the override entirely (back to default-visible).
 */
export async function setCustomerProductVisibility(
  tenantId: string,
  actorUserId: string,
  customerId: string,
  productId: string,
  visibility: "VISIBLE" | "HIDDEN" | null
) {
  return withTenantContext(tenantId, async (tx) => {
    await assertCustomerBelongsToTenant(tx, customerId);
    await assertProductBelongsToTenant(tx, productId);

    const before = await tx.customerProductVisibility.findUnique({
      where: { customerId_productId: { customerId, productId } },
    });

    if (visibility === null) {
      if (!before) return null;
      await tx.customerProductVisibility.delete({ where: { customerId_productId: { customerId, productId } } });
      await writeAuditLogEntry(tx, {
        tenantId,
        actorUserId,
        actingContext: "TENANT",
        entityType: "CustomerProductVisibility",
        entityId: before.id,
        action: "DEACTIVATE",
        oldValue: before,
        reason: "Override cleared - back to default visibility",
      });
      return null;
    }

    const after = await tx.customerProductVisibility.upsert({
      where: { customerId_productId: { customerId, productId } },
      create: { customerId, productId, visibility },
      update: { visibility },
    });

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "CustomerProductVisibility",
      entityId: after.id,
      action: before ? "UPDATE" : "CREATE",
      oldValue: before,
      newValue: after,
    });
    return after;
  });
}
