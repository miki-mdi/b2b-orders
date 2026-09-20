import type { PriceListItemInput } from "@/lib/validation/pricing";
import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";
import { DuplicateValueError, isUniqueConstraintError } from "@/lib/domain/shared/errors";

export class PriceListNotFoundError extends Error {}
export class ProductUnitNotFoundError extends Error {}

// Same "FK alone isn't enough" reasoning as the catalog services - see
// src/lib/domain/catalog/product-service.ts's assertCategoryBelongsToTenant.
async function assertPriceListBelongsToTenant(tx: ScopedTransactionClient, priceListId: string) {
  const priceList = await tx.priceList.findUnique({ where: { id: priceListId } });
  if (!priceList) {
    throw new PriceListNotFoundError("Price list not found.");
  }
}

async function assertProductUnitBelongsToTenant(tx: ScopedTransactionClient, productUnitId: string) {
  const productUnit = await tx.productUnit.findUnique({ where: { id: productUnitId } });
  if (!productUnit) {
    throw new ProductUnitNotFoundError("Product unit not found.");
  }
}

export function getPriceListItem(tenantId: string, id: string) {
  return withTenantContext(tenantId, (tx) =>
    tx.priceListItem.findUnique({
      where: { id },
      include: { productUnit: { include: { product: true, unitOfMeasure: true } } },
    })
  );
}

export async function createPriceListItem(
  tenantId: string,
  actorUserId: string,
  priceListId: string,
  input: PriceListItemInput
) {
  return withTenantContext(tenantId, async (tx) => {
    await assertPriceListBelongsToTenant(tx, priceListId);
    await assertProductUnitBelongsToTenant(tx, input.productUnitId);

    let item;
    try {
      // The @@unique([priceListId, productUnitId]) constraint on
      // PriceListItem is what actually prevents a duplicate entry - this
      // catch just turns that DB-level rejection into a friendly error.
      item = await tx.priceListItem.create({
        data: { priceListId, productUnitId: input.productUnitId, price: input.price },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new DuplicateValueError("productUnitId", "This product unit already has a price in this price list.");
      }
      throw error;
    }

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "PriceListItem",
      entityId: item.id,
      action: "CREATE",
      newValue: item,
    });
    return item;
  });
}

export async function updatePriceListItem(
  tenantId: string,
  actorUserId: string,
  id: string,
  input: Pick<PriceListItemInput, "price">
) {
  return withTenantContext(tenantId, async (tx) => {
    const before = await tx.priceListItem.findUniqueOrThrow({ where: { id } });
    const after = await tx.priceListItem.update({ where: { id }, data: { price: input.price } });

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "PriceListItem",
      entityId: id,
      action: "UPDATE",
      oldValue: before,
      newValue: after,
    });
    return after;
  });
}

export async function deletePriceListItem(tenantId: string, actorUserId: string, id: string) {
  return withTenantContext(tenantId, async (tx) => {
    const before = await tx.priceListItem.findUniqueOrThrow({ where: { id } });
    await tx.priceListItem.delete({ where: { id } });

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "PriceListItem",
      entityId: id,
      action: "DEACTIVATE", // no dedicated DELETE action; treated as a terminal removal for audit purposes
      oldValue: before,
    });
    return before;
  });
}
