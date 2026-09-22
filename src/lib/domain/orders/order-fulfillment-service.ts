import type { OrderStatus, Prisma } from "@prisma/client";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";
import type { ConfirmOrderLineInput } from "@/lib/validation/orders";
import { assertValidOrderTransition, isValidOrderTransition } from "./order-status-machine";
import { publishOrderEvent, type OrderEventType } from "./order-events";

const QTY_TOLERANCE = 1e-6;

export type ConfirmOrderLineIssue = {
  orderLineId: string;
  issue: "LINE_NOT_FOUND" | "EXCEEDS_REQUESTED_QTY" | "REASON_REQUIRED" | "NEGATIVE_QTY";
};

export type ConfirmOrderResult =
  | { ok: true; order: Prisma.OrderGetPayload<{ include: { lines: true } }> }
  | { ok: false; reason: "ORDER_NOT_FOUND" }
  | { ok: false; reason: "INVALID_TRANSITION" }
  | { ok: false; reason: "LINE_ISSUES"; lineIssues: ConfirmOrderLineIssue[] };

/**
 * Seller review of a SUBMITTED order. Every line's confirmedQty is checked
 * against ITS OWN requestedQty fetched from the database in this same
 * transaction - never trusted from the form - per the locked Phase 1D
 * rules:
 *   - a seller may reduce confirmedQty (partial fulfillment, per line -
 *     docs/ORDER_WORKFLOW.md §1 item 1 rejected a separate
 *     PARTIALLY_CONFIRMED order status in favor of exactly this)
 *   - a seller may confirm 0 (the line becomes unavailable - unavailableReason
 *     is set to the same required reason)
 *   - a seller must NOT increase confirmedQty above requestedQty - there is
 *     no business rule yet for a seller offering more than was asked for
 *   - any actual change requires a reason (validated here, not by the zod
 *     schema alone, since it needs the DB's requestedQty to compare against)
 *
 * requestedQty and the price/discount/VAT snapshot fields are NEVER
 * written by this function - only confirmedQty and (conditionally)
 * unavailableReason change on OrderLine, and Order.status/confirmedAt on
 * the order itself. This is what makes the original submission
 * reconstructable afterwards (see order-totals.ts's
 * computeSubmittedOrderTotals).
 */
export async function confirmOrder(
  tenantId: string,
  actorUserId: string,
  orderId: string,
  lines: ConfirmOrderLineInput[]
): Promise<ConfirmOrderResult> {
  const result = await withTenantContext(tenantId, async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true } });
    if (!order) {
      return { ok: false as const, reason: "ORDER_NOT_FOUND" as const };
    }
    if (!isValidOrderTransition(order.status, "CONFIRMED")) {
      return { ok: false as const, reason: "INVALID_TRANSITION" as const };
    }

    const lineById = new Map(order.lines.map((line) => [line.id, line]));
    const issues: ConfirmOrderLineIssue[] = [];

    for (const input of lines) {
      const existing = lineById.get(input.orderLineId);
      if (!existing) {
        issues.push({ orderLineId: input.orderLineId, issue: "LINE_NOT_FOUND" });
        continue;
      }
      if (input.confirmedQty < 0) {
        issues.push({ orderLineId: input.orderLineId, issue: "NEGATIVE_QTY" });
        continue;
      }
      const requestedQty = Number(existing.requestedQty);
      if (input.confirmedQty > requestedQty + QTY_TOLERANCE) {
        issues.push({ orderLineId: input.orderLineId, issue: "EXCEEDS_REQUESTED_QTY" });
        continue;
      }
      const changed = Math.abs(input.confirmedQty - requestedQty) > QTY_TOLERANCE;
      if (changed && !input.reason) {
        issues.push({ orderLineId: input.orderLineId, issue: "REASON_REQUIRED" });
      }
    }

    // Every order line must be accounted for - a line silently left out of
    // the submission would otherwise stay confirmedQty = null forever.
    for (const line of order.lines) {
      if (!lines.some((input) => input.orderLineId === line.id)) {
        issues.push({ orderLineId: line.id, issue: "LINE_NOT_FOUND" });
      }
    }

    if (issues.length > 0) {
      return { ok: false as const, reason: "LINE_ISSUES" as const, lineIssues: issues };
    }

    for (const input of lines) {
      const existing = lineById.get(input.orderLineId)!;
      const requestedQty = Number(existing.requestedQty);
      const changed = Math.abs(input.confirmedQty - requestedQty) > QTY_TOLERANCE;

      await tx.orderLine.update({
        where: { id: input.orderLineId },
        data: {
          confirmedQty: input.confirmedQty,
          unavailableReason: input.confirmedQty <= QTY_TOLERANCE ? (input.reason ?? null) : null,
        },
      });

      if (changed) {
        await writeAuditLogEntry(tx, {
          tenantId,
          actorUserId,
          actingContext: "TENANT",
          entityType: "OrderLine",
          entityId: input.orderLineId,
          action: "UPDATE",
          fieldName: "confirmedQty",
          oldValue: requestedQty,
          newValue: input.confirmedQty,
          reason: input.reason,
        });
      }
    }

    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
      include: { lines: true },
    });

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "Order",
      entityId: orderId,
      action: "UPDATE",
      fieldName: "status",
      oldValue: order.status,
      newValue: updatedOrder.status,
    });

    return { ok: true as const, order: updatedOrder };
  });

  if (result.ok) {
    await publishOrderEvent({
      type: "CONFIRMED",
      tenantId,
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      customerId: result.order.customerId,
      actorUserId,
      occurredAt: new Date(),
    });
  }
  return result;
}

/**
 * The generic forward-only status advance used for PICKING / READY /
 * OUT_FOR_DELIVERY / DELIVERED - none of these change any line, only the
 * order's own status (and, for DELIVERED, deliveredAt). The target status
 * is always a fixed literal supplied by the calling Server Action (one
 * action per button - markPickingAction, markReadyAction, etc.), never a
 * value read out of form data, so a request can never smuggle in an
 * arbitrary status string - see src/app/[locale]/seller/orders/[id]/actions.ts.
 */
export type AdvanceableOrderStatus = Extract<OrderStatus, "PICKING" | "READY" | "OUT_FOR_DELIVERY" | "DELIVERED">;

export type AdvanceOrderStatusResult =
  | { ok: true; order: Prisma.OrderGetPayload<{ include: { lines: true } }> }
  | { ok: false; reason: "ORDER_NOT_FOUND" }
  | { ok: false; reason: "NOT_ASSIGNED_DRIVER" }
  | { ok: false; reason: "INVALID_TRANSITION" };

export type AdvanceOrderStatusOptions = {
  // Phase 1F-B3: when set, the transition is rejected as NOT_ASSIGNED_DRIVER
  // unless the order's assignedDriverMembershipId equals this exact value -
  // checked inside the same transaction as the status read/write, so there
  // is no window for a reassignment to race the check. Callers only ever
  // pass this for a Delivery Driver session (see
  // src/app/[locale]/seller/orders/[id]/actions.ts) - omitted entirely for
  // every other role, so Seller Admin/Sales Rep/Warehouse Worker behavior is
  // byte-for-byte unchanged.
  requireDriverMembershipId?: string;
};

const EVENT_TYPE_BY_STATUS: Record<AdvanceableOrderStatus, OrderEventType> = {
  PICKING: "PICKING",
  READY: "READY",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
};

export async function advanceOrderStatus(
  tenantId: string,
  actorUserId: string,
  orderId: string,
  targetStatus: AdvanceableOrderStatus,
  options?: AdvanceOrderStatusOptions
): Promise<AdvanceOrderStatusResult> {
  const result = await withTenantContext(tenantId, async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return { ok: false as const, reason: "ORDER_NOT_FOUND" as const };
    }
    if (
      options?.requireDriverMembershipId &&
      order.assignedDriverMembershipId !== options.requireDriverMembershipId
    ) {
      return { ok: false as const, reason: "NOT_ASSIGNED_DRIVER" as const };
    }
    if (!isValidOrderTransition(order.status, targetStatus)) {
      return { ok: false as const, reason: "INVALID_TRANSITION" as const };
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: targetStatus,
        ...(targetStatus === "DELIVERED" ? { deliveredAt: new Date() } : {}),
      },
      include: { lines: true },
    });

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "Order",
      entityId: orderId,
      action: "UPDATE",
      fieldName: "status",
      oldValue: order.status,
      newValue: updated.status,
    });

    return { ok: true as const, order: updated };
  });

  if (result.ok) {
    await publishOrderEvent({
      type: EVENT_TYPE_BY_STATUS[targetStatus],
      tenantId,
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      customerId: result.order.customerId,
      actorUserId,
      occurredAt: new Date(),
    });
  }
  return result;
}

// Re-exported so callers only need one import for "why did this transition fail".
export { assertValidOrderTransition, isValidOrderTransition };
