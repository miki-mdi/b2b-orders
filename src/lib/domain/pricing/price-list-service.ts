import type { PriceListInput } from "@/lib/validation/pricing";
import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";
import { DuplicateValueError, isUniqueConstraintError } from "@/lib/domain/shared/errors";

export function listPriceLists(tenantId: string) {
  return withTenantContext(tenantId, (tx) => tx.priceList.findMany({ orderBy: { name: "asc" } }));
}

export function getPriceList(tenantId: string, id: string) {
  return withTenantContext(tenantId, (tx) =>
    tx.priceList.findUnique({
      where: { id },
      include: {
        items: {
          include: { productUnit: { include: { product: true, unitOfMeasure: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    })
  );
}

function toData(input: PriceListInput) {
  return {
    name: input.name,
    code: input.code ?? null,
    description: input.description ?? null,
    currency: input.currency,
    isDefault: input.isDefault,
    isActive: input.isActive,
  };
}

/** Tx-scoped core, reused by CSV import (Phase 1F-A) - see category-service.ts's createCategoryInTx comment. */
export async function createPriceListInTx(
  tx: ScopedTransactionClient,
  tenantId: string,
  actorUserId: string,
  input: PriceListInput,
  reason?: string
) {
  let priceList;
  try {
    priceList = await tx.priceList.create({ data: { tenantId, ...toData(input) } });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateValueError("code", "This code is already used by another price list.");
    }
    throw error;
  }

  await writeAuditLogEntry(tx, {
    tenantId,
    actorUserId,
    actingContext: "TENANT",
    entityType: "PriceList",
    entityId: priceList.id,
    action: "CREATE",
    newValue: priceList,
    reason,
  });
  return priceList;
}

export async function createPriceList(tenantId: string, actorUserId: string, input: PriceListInput) {
  return withTenantContext(tenantId, (tx) => createPriceListInTx(tx, tenantId, actorUserId, input));
}

/** Tx-scoped core, reused by CSV import (Phase 1F-A). */
export async function updatePriceListInTx(
  tx: ScopedTransactionClient,
  tenantId: string,
  actorUserId: string,
  id: string,
  input: PriceListInput,
  reason?: string
) {
  const before = await tx.priceList.findUniqueOrThrow({ where: { id } });
  let after;
  try {
    after = await tx.priceList.update({ where: { id }, data: toData(input) });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateValueError("code", "This code is already used by another price list.");
    }
    throw error;
  }

  await writeAuditLogEntry(tx, {
    tenantId,
    actorUserId,
    actingContext: "TENANT",
    entityType: "PriceList",
    entityId: id,
    action: "UPDATE",
    oldValue: before,
    newValue: after,
    reason,
  });
  return after;
}

export async function updatePriceList(tenantId: string, actorUserId: string, id: string, input: PriceListInput) {
  return withTenantContext(tenantId, (tx) => updatePriceListInTx(tx, tenantId, actorUserId, id, input));
}

export async function setPriceListActive(tenantId: string, actorUserId: string, id: string, isActive: boolean) {
  return withTenantContext(tenantId, async (tx) => {
    const before = await tx.priceList.findUniqueOrThrow({ where: { id } });
    const after = await tx.priceList.update({ where: { id }, data: { isActive } });
    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "PriceList",
      entityId: id,
      action: isActive ? "REACTIVATE" : "DEACTIVATE",
      oldValue: before,
      newValue: after,
    });
    return after;
  });
}
