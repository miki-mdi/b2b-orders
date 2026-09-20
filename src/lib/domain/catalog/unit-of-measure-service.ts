import type { UnitOfMeasureInput } from "@/lib/validation/catalog";
import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";
import { DuplicateValueError, isUniqueConstraintError } from "@/lib/domain/shared/errors";

export function listUnitsOfMeasure(tenantId: string) {
  return withTenantContext(tenantId, (tx) => tx.unitOfMeasure.findMany({ orderBy: { code: "asc" } }));
}

export function getUnitOfMeasure(tenantId: string, id: string) {
  return withTenantContext(tenantId, (tx) => tx.unitOfMeasure.findUnique({ where: { id } }));
}

/** Tx-scoped core, reused by CSV import (Phase 1F-A) - see category-service.ts's createCategoryInTx comment for why this split exists. */
export async function createUnitOfMeasureInTx(
  tx: ScopedTransactionClient,
  tenantId: string,
  actorUserId: string,
  input: UnitOfMeasureInput,
  reason?: string
) {
  let unit;
  try {
    unit = await tx.unitOfMeasure.create({
      data: {
        tenantId,
        code: input.code,
        labelMk: input.labelMk,
        labelEn: input.labelEn,
        isActive: input.isActive,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateValueError("code", "This code is already used by another unit of measure.");
    }
    throw error;
  }
  await writeAuditLogEntry(tx, {
    tenantId,
    actorUserId,
    actingContext: "TENANT",
    entityType: "UnitOfMeasure",
    entityId: unit.id,
    action: "CREATE",
    newValue: unit,
    reason,
  });
  return unit;
}

export async function createUnitOfMeasure(tenantId: string, actorUserId: string, input: UnitOfMeasureInput) {
  return withTenantContext(tenantId, (tx) => createUnitOfMeasureInTx(tx, tenantId, actorUserId, input));
}

/** Tx-scoped core, reused by CSV import (Phase 1F-A). */
export async function updateUnitOfMeasureInTx(
  tx: ScopedTransactionClient,
  tenantId: string,
  actorUserId: string,
  id: string,
  input: UnitOfMeasureInput,
  reason?: string
) {
  const before = await tx.unitOfMeasure.findUniqueOrThrow({ where: { id } });
  let after;
  try {
    after = await tx.unitOfMeasure.update({
      where: { id },
      data: {
        code: input.code,
        labelMk: input.labelMk,
        labelEn: input.labelEn,
        isActive: input.isActive,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateValueError("code", "This code is already used by another unit of measure.");
    }
    throw error;
  }
  await writeAuditLogEntry(tx, {
    tenantId,
    actorUserId,
    actingContext: "TENANT",
    entityType: "UnitOfMeasure",
    entityId: id,
    action: "UPDATE",
    oldValue: before,
    newValue: after,
    reason,
  });
  return after;
}

export async function updateUnitOfMeasure(
  tenantId: string,
  actorUserId: string,
  id: string,
  input: UnitOfMeasureInput
) {
  return withTenantContext(tenantId, (tx) => updateUnitOfMeasureInTx(tx, tenantId, actorUserId, id, input));
}

export async function setUnitOfMeasureActive(tenantId: string, actorUserId: string, id: string, isActive: boolean) {
  return withTenantContext(tenantId, async (tx) => {
    const before = await tx.unitOfMeasure.findUniqueOrThrow({ where: { id } });
    const after = await tx.unitOfMeasure.update({ where: { id }, data: { isActive } });
    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "UnitOfMeasure",
      entityId: id,
      action: isActive ? "REACTIVATE" : "DEACTIVATE",
      oldValue: before,
      newValue: after,
    });
    return after;
  });
}
