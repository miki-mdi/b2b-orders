import type { ActingContext } from "@prisma/client";
import { withTenantContext } from "@/lib/db/with-tenant";

export class OrderNotFoundForActivityError extends Error {}

export type OrderActivityItem = {
  id: string;
  createdAt: Date;
  actorName: string | null;
  actingContext: ActingContext;
  entityType: string;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  /** Only set for entityType "OrderLine" entries - the line's snapshot product name, for a readable timeline label. */
  lineProductName: string | null;
};

/**
 * Human-readable activity/history timeline for one order (Phase 1E, §2).
 * Built entirely from persisted AuditLogEntry rows - never a synthetic or
 * inferred event - per the brief's explicit "do not invent events that are
 * not present in persisted data." Every order-affecting write in this
 * codebase already writes an audit entry in the same transaction (creation,
 * confirmation quantity adjustments, every status transition, cancellation
 * - see docs/SECURITY_AND_MULTI_TENANCY.md §7), so this is a pure read, not
 * a new source of truth.
 *
 * Covers both entityType "Order" (creation, status transitions,
 * cancellation) and entityType "OrderLine" for this order's own lines
 * (confirmedQty adjustments) - a seller reducing one line's quantity is
 * exactly as much a part of "what happened to this order" as a status
 * change is.
 */
export async function listOrderActivity(tenantId: string, orderId: string): Promise<OrderActivityItem[]> {
  return withTenantContext(tenantId, async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { lines: { select: { id: true, productNameSnapshot: true } } },
    });
    if (!order) {
      throw new OrderNotFoundForActivityError("Order not found.");
    }
    const lineIds = order.lines.map((line) => line.id);
    const productNameByLineId = new Map(order.lines.map((line) => [line.id, line.productNameSnapshot]));

    const rows = await tx.auditLogEntry.findMany({
      where: {
        OR: [
          { entityType: "Order", entityId: orderId },
          ...(lineIds.length > 0 ? [{ entityType: "OrderLine", entityId: { in: lineIds } }] : []),
        ],
      },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      actorName: row.actor?.name ?? null,
      actingContext: row.actingContext,
      entityType: row.entityType,
      action: row.action,
      fieldName: row.fieldName,
      oldValue: row.oldValue,
      newValue: row.newValue,
      reason: row.reason,
      lineProductName: row.entityType === "OrderLine" ? (productNameByLineId.get(row.entityId) ?? null) : null,
    }));
  });
}
