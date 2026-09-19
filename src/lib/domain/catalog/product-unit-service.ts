import type { ProductUnitInput } from "@/lib/validation/catalog";
import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";
import { DuplicateValueError, isUniqueConstraintError } from "./errors";

export class ProductNotFoundError extends Error {}
export class UnitOfMeasureNotFoundError extends Error {}

// Same reasoning as product-service.ts's assertCategoryBelongsToTenant: FK
// constraints alone don't stop a row from referencing another tenant's
// parent row, since FK checks bypass RLS by design. These lookups go
// through the tenant-scoped `tx`, so a foreign-tenant row is correctly
// invisible here.
async function assertProductBelongsToTenant(tx: ScopedTransactionClient, productId: string) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw new ProductNotFoundError("Product not found.");
  }
}

async function assertUnitOfMeasureBelongsToTenant(tx: ScopedTransactionClient, unitOfMeasureId: string) {
  const unit = await tx.unitOfMeasure.findUnique({ where: { id: unitOfMeasureId } });
  if (!unit) {
    throw new UnitOfMeasureNotFoundError("Unit of measure not found.");
  }
}

export function listProductUnits(tenantId: string, productId: string) {
  return withTenantContext(tenantId, (tx) =>
    tx.productUnit.findMany({
      where: { productId },
      include: { unitOfMeasure: true },
      orderBy: { createdAt: "asc" },
    })
  );
}

export function getProductUnit(tenantId: string, id: string) {
  return withTenantContext(tenantId, (tx) => tx.productUnit.findUnique({ where: { id }, include: { unitOfMeasure: true } }));
}

export async function createProductUnit(
  tenantId: string,
  actorUserId: string,
  productId: string,
  input: ProductUnitInput
) {
  return withTenantContext(tenantId, async (tx) => {
    await assertProductBelongsToTenant(tx, productId);
    await assertUnitOfMeasureBelongsToTenant(tx, input.unitOfMeasureId);

    let productUnit;
    try {
      productUnit = await tx.productUnit.create({
        data: {
          tenantId,
          productId,
          unitOfMeasureId: input.unitOfMeasureId,
          sku: input.sku,
          label: input.label,
          barcode: input.barcode ?? null,
          conversionFactorToBase: input.conversionFactorToBase ?? null,
          minOrderQty: input.minOrderQty,
          orderIncrement: input.orderIncrement,
          isDefault: input.isDefault,
          isActive: input.isActive,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new DuplicateValueError("sku", "This SKU is already used by another product unit.");
      }
      throw error;
    }

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "ProductUnit",
      entityId: productUnit.id,
      action: "CREATE",
      newValue: productUnit,
    });
    return productUnit;
  });
}

export async function updateProductUnit(tenantId: string, actorUserId: string, id: string, input: ProductUnitInput) {
  return withTenantContext(tenantId, async (tx) => {
    await assertUnitOfMeasureBelongsToTenant(tx, input.unitOfMeasureId);

    const before = await tx.productUnit.findUniqueOrThrow({ where: { id } });
    let after;
    try {
      after = await tx.productUnit.update({
        where: { id },
        data: {
          unitOfMeasureId: input.unitOfMeasureId,
          sku: input.sku,
          label: input.label,
          barcode: input.barcode ?? null,
          conversionFactorToBase: input.conversionFactorToBase ?? null,
          minOrderQty: input.minOrderQty,
          orderIncrement: input.orderIncrement,
          isDefault: input.isDefault,
          isActive: input.isActive,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new DuplicateValueError("sku", "This SKU is already used by another product unit.");
      }
      throw error;
    }

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "ProductUnit",
      entityId: id,
      action: "UPDATE",
      oldValue: before,
      newValue: after,
    });
    return after;
  });
}

export async function setProductUnitActive(tenantId: string, actorUserId: string, id: string, isActive: boolean) {
  return withTenantContext(tenantId, async (tx) => {
    const before = await tx.productUnit.findUniqueOrThrow({ where: { id } });
    const after = await tx.productUnit.update({ where: { id }, data: { isActive } });
    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "ProductUnit",
      entityId: id,
      action: isActive ? "REACTIVATE" : "DEACTIVATE",
      oldValue: before,
      newValue: after,
    });
    return after;
  });
}
