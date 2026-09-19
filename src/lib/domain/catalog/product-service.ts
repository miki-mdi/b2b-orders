import type { ProductInput } from "@/lib/validation/catalog";
import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";
import { DuplicateValueError, isUniqueConstraintError } from "./errors";

export class CategoryNotFoundError extends Error {}

export function listProducts(tenantId: string) {
  return withTenantContext(tenantId, (tx) =>
    tx.product.findMany({ include: { category: true }, orderBy: { nameEn: "asc" } })
  );
}

export function getProduct(tenantId: string, id: string) {
  return withTenantContext(tenantId, (tx) =>
    tx.product.findUnique({
      where: { id },
      include: { category: true, units: { include: { unitOfMeasure: true }, orderBy: { createdAt: "asc" } } },
    })
  );
}

/**
 * A Postgres foreign key constraint only checks that the referenced row
 * EXISTS - FK checks run bypassing RLS (by design, so inserting a child row
 * isn't blocked by unrelated policies on the parent table), so it would NOT
 * by itself stop a Product from pointing at another tenant's Category. This
 * lookup goes through the same tenant-scoped `tx` as everything else, so a
 * category belonging to a different tenant comes back as not found here -
 * that's the actual enforcement, not the FK constraint.
 */
async function assertCategoryBelongsToTenant(tx: ScopedTransactionClient, categoryId: string) {
  const category = await tx.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw new CategoryNotFoundError("Category not found.");
  }
}

export async function createProduct(tenantId: string, actorUserId: string, input: ProductInput) {
  return withTenantContext(tenantId, async (tx) => {
    await assertCategoryBelongsToTenant(tx, input.categoryId);

    let product;
    try {
      product = await tx.product.create({
        data: {
          tenantId,
          categoryId: input.categoryId,
          nameMk: input.nameMk,
          nameEn: input.nameEn,
          sku: input.sku,
          description: input.description ?? null,
          barcode: input.barcode ?? null,
          imageUrl: input.imageUrl ?? null,
          defaultVatRate: input.defaultVatRate ?? null,
          isActive: input.isActive,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new DuplicateValueError("sku", "This SKU is already used by another product.");
      }
      throw error;
    }

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "Product",
      entityId: product.id,
      action: "CREATE",
      newValue: product,
    });
    return product;
  });
}

export async function updateProduct(tenantId: string, actorUserId: string, id: string, input: ProductInput) {
  return withTenantContext(tenantId, async (tx) => {
    await assertCategoryBelongsToTenant(tx, input.categoryId);

    const before = await tx.product.findUniqueOrThrow({ where: { id } });
    let after;
    try {
      after = await tx.product.update({
        where: { id },
        data: {
          categoryId: input.categoryId,
          nameMk: input.nameMk,
          nameEn: input.nameEn,
          sku: input.sku,
          description: input.description ?? null,
          barcode: input.barcode ?? null,
          imageUrl: input.imageUrl ?? null,
          defaultVatRate: input.defaultVatRate ?? null,
          isActive: input.isActive,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new DuplicateValueError("sku", "This SKU is already used by another product.");
      }
      throw error;
    }

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "Product",
      entityId: id,
      action: "UPDATE",
      oldValue: before,
      newValue: after,
    });
    return after;
  });
}

export async function setProductActive(tenantId: string, actorUserId: string, id: string, isActive: boolean) {
  return withTenantContext(tenantId, async (tx) => {
    const before = await tx.product.findUniqueOrThrow({ where: { id } });
    const after = await tx.product.update({ where: { id }, data: { isActive } });
    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "Product",
      entityId: id,
      action: isActive ? "REACTIVATE" : "DEACTIVATE",
      oldValue: before,
      newValue: after,
    });
    return after;
  });
}
