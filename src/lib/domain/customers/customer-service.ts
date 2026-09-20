import type { CustomerInput } from "@/lib/validation/customers";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";
import { DuplicateValueError, isUniqueConstraintError } from "@/lib/domain/shared/errors";
import { clampPage, clampPageSize, toPageResult, type PageResult } from "@/lib/pagination";

export function listCustomers(tenantId: string) {
  return withTenantContext(tenantId, (tx) => tx.customer.findMany({ orderBy: { name: "asc" } }));
}

/** Paginated variant for the seller customers list UI (Phase 1E, §8) - see listOrdersForTenantPage's comment for why this is a separate function rather than changing listCustomers itself. */
export async function listCustomersPage(
  tenantId: string,
  page?: number,
  pageSize?: number
): Promise<PageResult<Awaited<ReturnType<typeof listCustomers>>[number]>> {
  const resolvedPage = clampPage(page);
  const resolvedPageSize = clampPageSize(pageSize);
  return withTenantContext(tenantId, async (tx) => {
    const [items, total] = await Promise.all([
      tx.customer.findMany({
        orderBy: { name: "asc" },
        skip: (resolvedPage - 1) * resolvedPageSize,
        take: resolvedPageSize,
      }),
      tx.customer.count(),
    ]);
    return toPageResult(items, total, resolvedPage, resolvedPageSize);
  });
}

export function getCustomer(tenantId: string, id: string) {
  return withTenantContext(tenantId, (tx) =>
    tx.customer.findUnique({
      where: { id },
      include: {
        addresses: { orderBy: [{ isDefaultDelivery: "desc" }, { createdAt: "asc" }] },
        priceListAssignment: { include: { priceList: true } },
      },
    })
  );
}

function toData(input: CustomerInput) {
  return {
    name: input.name,
    code: input.code ?? null,
    taxId: input.taxId ?? null,
    contactEmail: input.contactEmail ?? null,
    contactPhone: input.contactPhone ?? null,
    notes: input.notes ?? null,
    creditLimit: input.creditLimit ?? null,
    paymentTermsDays: input.paymentTermsDays ?? null,
    isActive: input.isActive,
  };
}

export async function createCustomer(tenantId: string, actorUserId: string, input: CustomerInput) {
  return withTenantContext(tenantId, async (tx) => {
    let customer;
    try {
      customer = await tx.customer.create({ data: { tenantId, ...toData(input) } });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new DuplicateValueError("code", "This customer code is already in use.");
      }
      throw error;
    }

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "Customer",
      entityId: customer.id,
      action: "CREATE",
      newValue: customer,
    });
    return customer;
  });
}

export async function updateCustomer(tenantId: string, actorUserId: string, id: string, input: CustomerInput) {
  return withTenantContext(tenantId, async (tx) => {
    const before = await tx.customer.findUniqueOrThrow({ where: { id } });
    let after;
    try {
      after = await tx.customer.update({ where: { id }, data: toData(input) });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new DuplicateValueError("code", "This customer code is already in use.");
      }
      throw error;
    }

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "Customer",
      entityId: id,
      action: "UPDATE",
      oldValue: before,
      newValue: after,
    });
    return after;
  });
}

export async function setCustomerActive(tenantId: string, actorUserId: string, id: string, isActive: boolean) {
  return withTenantContext(tenantId, async (tx) => {
    const before = await tx.customer.findUniqueOrThrow({ where: { id } });
    const after = await tx.customer.update({ where: { id }, data: { isActive } });
    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "Customer",
      entityId: id,
      action: isActive ? "REACTIVATE" : "DEACTIVATE",
      oldValue: before,
      newValue: after,
    });
    return after;
  });
}
