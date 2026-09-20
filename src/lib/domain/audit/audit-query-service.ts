import type { ActingContext } from "@prisma/client";
import { withTenantContext } from "@/lib/db/with-tenant";
import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import { clampPage, clampPageSize, DEFAULT_PAGE_SIZE } from "@/lib/pagination";

/**
 * Seller-facing read side of AuditLogEntry (Phase 1E). The write side
 * (src/lib/domain/audit/audit-log.ts) stays untouched - this module only
 * ever reads, never writes, matching the append-only guarantee in
 * docs/SECURITY_AND_MULTI_TENANCY.md §7 ("no update/delete in application
 * code"). Every query goes through withTenantContext like every other
 * domain function, so tenant isolation (Layer 2 + RLS) applies exactly the
 * same way it does to every other tenant-scoped read in this codebase.
 */

export const AUDIT_LOG_DEFAULT_PAGE_SIZE = DEFAULT_PAGE_SIZE;

export type AuditLogFilter = {
  dateFrom?: Date;
  dateTo?: Date;
  actorUserId?: string;
  entityType?: string;
  action?: string;
};

export type AuditLogEntryView = {
  id: string;
  createdAt: Date;
  actorUserId: string | null;
  actorName: string | null;
  actingContext: ActingContext;
  entityType: string;
  entityId: string;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  /** A human-readable pointer to the affected order/customer/product, only when it can be resolved safely (same tenant, still exists). */
  entityReference: string | null;
};

export type AuditLogPageResult = {
  entries: AuditLogEntryView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function whereFromFilter(filter: AuditLogFilter) {
  return {
    ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.dateFrom || filter.dateTo
      ? {
          createdAt: {
            ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
            ...(filter.dateTo ? { lte: filter.dateTo } : {}),
          },
        }
      : {}),
  };
}

/**
 * Resolves a safe, human-readable label for the entity an audit entry
 * points at - "safely resolvable" per the Phase 1E brief means: only within
 * the SAME tenant-scoped transaction (so it can never leak another
 * tenant's row) and only when the row still exists (a deleted/renamed
 * reference degrades to null rather than throwing). Batched per entity
 * type across the whole page instead of one query per row, to avoid an
 * N+1 query pattern on a list that can be up to AUDIT_LOG_MAX_PAGE_SIZE rows.
 */
async function resolveEntityReferences(
  tx: ScopedTransactionClient,
  entries: { entityType: string; entityId: string }[]
): Promise<Map<string, string>> {
  const references = new Map<string, string>();
  const idsByType = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (!idsByType.has(entry.entityType)) idsByType.set(entry.entityType, new Set());
    idsByType.get(entry.entityType)!.add(entry.entityId);
  }

  const orderIds = [...(idsByType.get("Order") ?? [])];
  if (orderIds.length > 0) {
    const orders = await tx.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, orderNumber: true },
    });
    for (const order of orders) {
      references.set(`Order:${order.id}`, `Order #${order.orderNumber}`);
    }
  }

  const orderLineIds = [...(idsByType.get("OrderLine") ?? [])];
  if (orderLineIds.length > 0) {
    const lines = await tx.orderLine.findMany({
      where: { id: { in: orderLineIds } },
      select: { id: true, productNameSnapshot: true, order: { select: { orderNumber: true } } },
    });
    for (const line of lines) {
      references.set(`OrderLine:${line.id}`, `Order #${line.order.orderNumber} - ${line.productNameSnapshot}`);
    }
  }

  const customerIds = [...(idsByType.get("Customer") ?? [])];
  if (customerIds.length > 0) {
    const customers = await tx.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true },
    });
    for (const customer of customers) {
      references.set(`Customer:${customer.id}`, customer.name);
    }
  }

  const productIds = [...(idsByType.get("Product") ?? [])];
  if (productIds.length > 0) {
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, nameEn: true, sku: true },
    });
    for (const product of products) {
      references.set(`Product:${product.id}`, `${product.nameEn} (${product.sku})`);
    }
  }

  return references;
}

export async function listAuditLogEntries(
  tenantId: string,
  filter: AuditLogFilter,
  page: number,
  pageSize: number
): Promise<AuditLogPageResult> {
  const resolvedPage = clampPage(page);
  const resolvedPageSize = clampPageSize(pageSize, AUDIT_LOG_DEFAULT_PAGE_SIZE);
  const where = whereFromFilter(filter);

  return withTenantContext(tenantId, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.auditLogEntry.findMany({
        where,
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip: (resolvedPage - 1) * resolvedPageSize,
        take: resolvedPageSize,
      }),
      tx.auditLogEntry.count({ where }),
    ]);

    const references = await resolveEntityReferences(tx, rows);

    const entries: AuditLogEntryView[] = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      actorUserId: row.actorUserId,
      actorName: row.actor?.name ?? null,
      actingContext: row.actingContext,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      fieldName: row.fieldName,
      oldValue: row.oldValue,
      newValue: row.newValue,
      reason: row.reason,
      entityReference: references.get(`${row.entityType}:${row.entityId}`) ?? null,
    }));

    return {
      entries,
      page: resolvedPage,
      pageSize: resolvedPageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / resolvedPageSize)),
    };
  });
}

export type AuditLogActor = { id: string; name: string };

/**
 * Distinct actors who appear in this tenant's audit log - drives the
 * "filter by actor" dropdown. Deliberately reads FROM the audit log itself
 * (not TenantMembership) since an actor can be a buyer (order submission/
 * cancellation) as well as seller staff - both must be filterable.
 */
export async function listAuditLogActors(tenantId: string): Promise<AuditLogActor[]> {
  return withTenantContext(tenantId, async (tx) => {
    const rows = await tx.auditLogEntry.findMany({
      where: { actorUserId: { not: null } },
      distinct: ["actorUserId"],
      select: { actor: { select: { id: true, name: true } } },
      orderBy: { actorUserId: "asc" },
    });
    return rows
      .filter((row): row is { actor: AuditLogActor } => row.actor !== null)
      .map((row) => row.actor)
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

/** Distinct entityType/action values seen in this tenant's log - drives the filter dropdowns without hardcoding a list that can drift from what's actually written. */
export async function listAuditLogFacets(tenantId: string): Promise<{ entityTypes: string[]; actions: string[] }> {
  return withTenantContext(tenantId, async (tx) => {
    const [entityTypeRows, actionRows] = await Promise.all([
      tx.auditLogEntry.findMany({ distinct: ["entityType"], select: { entityType: true } }),
      tx.auditLogEntry.findMany({ distinct: ["action"], select: { action: true } }),
    ]);
    return {
      entityTypes: entityTypeRows.map((r) => r.entityType).sort(),
      actions: actionRows.map((r) => r.action).sort(),
    };
  });
}
