import type { CategoryInput } from "@/lib/validation/catalog";
import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";
import { DuplicateValueError, isUniqueConstraintError } from "@/lib/domain/shared/errors";

export function listCategories(tenantId: string) {
  return withTenantContext(tenantId, (tx) => tx.category.findMany({ orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }));
}

export function getCategory(tenantId: string, id: string) {
  return withTenantContext(tenantId, (tx) => tx.category.findUnique({ where: { id } }));
}

/**
 * Tx-scoped core of createCategory - takes an already-open transaction so
 * callers that need several writes to share one atomic transaction (Phase
 * 1F-A's CSV import) can use the exact same business logic/audit trail as
 * the single-record UI path below, instead of duplicating it. `reason` lets
 * the import layer tag which batch created this row.
 */
export async function createCategoryInTx(
  tx: ScopedTransactionClient,
  tenantId: string,
  actorUserId: string,
  input: CategoryInput,
  reason?: string
) {
  let category;
  try {
    category = await tx.category.create({
      data: {
        tenantId,
        nameMk: input.nameMk,
        nameEn: input.nameEn,
        code: input.code ?? null,
        description: input.description ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateValueError("code", "This code is already used by another category.");
    }
    throw error;
  }
  await writeAuditLogEntry(tx, {
    tenantId,
    actorUserId,
    actingContext: "TENANT",
    entityType: "Category",
    entityId: category.id,
    action: "CREATE",
    newValue: category,
    reason,
  });
  return category;
}

export async function createCategory(tenantId: string, actorUserId: string, input: CategoryInput) {
  return withTenantContext(tenantId, (tx) => createCategoryInTx(tx, tenantId, actorUserId, input));
}

/** Tx-scoped core of updateCategory - see createCategoryInTx's comment. */
export async function updateCategoryInTx(
  tx: ScopedTransactionClient,
  tenantId: string,
  actorUserId: string,
  id: string,
  input: CategoryInput,
  reason?: string
) {
  const before = await tx.category.findUniqueOrThrow({ where: { id } });
  let after;
  try {
    after = await tx.category.update({
      where: { id },
      data: {
        nameMk: input.nameMk,
        nameEn: input.nameEn,
        code: input.code ?? null,
        description: input.description ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateValueError("code", "This code is already used by another category.");
    }
    throw error;
  }
  await writeAuditLogEntry(tx, {
    tenantId,
    actorUserId,
    actingContext: "TENANT",
    entityType: "Category",
    entityId: id,
    action: "UPDATE",
    oldValue: before,
    newValue: after,
    reason,
  });
  return after;
}

export async function updateCategory(tenantId: string, actorUserId: string, id: string, input: CategoryInput) {
  return withTenantContext(tenantId, (tx) => updateCategoryInTx(tx, tenantId, actorUserId, id, input));
}

export async function setCategoryActive(tenantId: string, actorUserId: string, id: string, isActive: boolean) {
  return withTenantContext(tenantId, async (tx) => {
    const before = await tx.category.findUniqueOrThrow({ where: { id } });
    const after = await tx.category.update({ where: { id }, data: { isActive } });
    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "Category",
      entityId: id,
      action: isActive ? "REACTIVATE" : "DEACTIVATE",
      oldValue: before,
      newValue: after,
    });
    return after;
  });
}
