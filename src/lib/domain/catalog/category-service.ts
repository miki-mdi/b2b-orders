import type { CategoryInput } from "@/lib/validation/catalog";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";

export function listCategories(tenantId: string) {
  return withTenantContext(tenantId, (tx) => tx.category.findMany({ orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }));
}

export function getCategory(tenantId: string, id: string) {
  return withTenantContext(tenantId, (tx) => tx.category.findUnique({ where: { id } }));
}

export async function createCategory(tenantId: string, actorUserId: string, input: CategoryInput) {
  return withTenantContext(tenantId, async (tx) => {
    const category = await tx.category.create({
      data: {
        tenantId,
        nameMk: input.nameMk,
        nameEn: input.nameEn,
        description: input.description ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
    });
    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "Category",
      entityId: category.id,
      action: "CREATE",
      newValue: category,
    });
    return category;
  });
}

export async function updateCategory(tenantId: string, actorUserId: string, id: string, input: CategoryInput) {
  return withTenantContext(tenantId, async (tx) => {
    const before = await tx.category.findUniqueOrThrow({ where: { id } });
    const after = await tx.category.update({
      where: { id },
      data: {
        nameMk: input.nameMk,
        nameEn: input.nameEn,
        description: input.description ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
    });
    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "Category",
      entityId: id,
      action: "UPDATE",
      oldValue: before,
      newValue: after,
    });
    return after;
  });
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
