import type { Order, OrderStatus } from "@prisma/client";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";

/**
 * Phase 1F-B3: Delivery Driver order assignment. See
 * docs/SESSION_HANDOFF.md's Phase 1F-B3 section for the full design -
 * Order.assignedDriverMembershipId references TenantMembership (not User)
 * via a composite, same-tenant-safe FK, so "who is this driver, in this
 * tenant" is a single unambiguous reference rather than something every
 * call site has to re-derive from a bare userId.
 */

const TERMINAL_STATUSES: readonly OrderStatus[] = ["DELIVERED", "CANCELLED"];

export type AssignDriverResult =
  | { ok: true; order: Order }
  | { ok: false; reason: "ORDER_NOT_FOUND" }
  | { ok: false; reason: "ORDER_TERMINAL" }
  | { ok: false; reason: "DRIVER_NOT_FOUND_OR_INELIGIBLE" };

/**
 * Resolves the id of the caller's own active DELIVERY_DRIVER
 * TenantMembership for this tenant, or null if none exists. Deliberately
 * re-validates role and isActive from the database itself rather than
 * trusting the caller's already-checked session.role - this is the one
 * function every driver-ownership check (both read-scoping and the
 * advanceOrderStatus mutation guard) is built on, so it must be correct on
 * its own, not merely correct given how its callers happen to use it today.
 */
export function getOwnActiveTenantMembershipId(tenantId: string, userId: string): Promise<string | null> {
  return withTenantContext(tenantId, (tx) =>
    tx.tenantMembership.findFirst({
      where: { tenantId, userId, isActive: true, role: "DELIVERY_DRIVER" },
      select: { id: true },
    })
  ).then((membership) => membership?.id ?? null);
}

export type TenantDriverOption = { membershipId: string; userName: string };

/** Active DELIVERY_DRIVER memberships in this tenant, for an assign/reassign picker. */
export async function listTenantDriverOptions(tenantId: string): Promise<TenantDriverOption[]> {
  const memberships = await withTenantContext(tenantId, (tx) =>
    tx.tenantMembership.findMany({
      where: { tenantId, role: "DELIVERY_DRIVER", isActive: true },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    })
  );
  return memberships.map((m) => ({ membershipId: m.id, userName: m.user.name }));
}

/**
 * Assign, reassign, or unassign (targetMembershipId: null) the driver
 * responsible for an order. Allowed in any non-terminal status - assignment
 * may happen well before READY, since a driver's own visibility is gated
 * separately by status (see order-service.ts's driverScope parameter), not
 * by when the assignment itself was made. Rejected outright once the order
 * is DELIVERED or CANCELLED, since reassigning a finished order has no
 * operational meaning.
 */
export async function assignDriverToOrder(
  tenantId: string,
  actorUserId: string,
  orderId: string,
  targetMembershipId: string | null
): Promise<AssignDriverResult> {
  return withTenantContext(tenantId, async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return { ok: false as const, reason: "ORDER_NOT_FOUND" as const };
    }
    if (TERMINAL_STATUSES.includes(order.status)) {
      return { ok: false as const, reason: "ORDER_TERMINAL" as const };
    }

    if (targetMembershipId) {
      const driver = await tx.tenantMembership.findFirst({
        where: { id: targetMembershipId, tenantId, role: "DELIVERY_DRIVER", isActive: true },
        select: { id: true },
      });
      if (!driver) {
        return { ok: false as const, reason: "DRIVER_NOT_FOUND_OR_INELIGIBLE" as const };
      }
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: { assignedDriverMembershipId: targetMembershipId },
    });

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "Order",
      entityId: orderId,
      action: "UPDATE",
      fieldName: "assignedDriverMembershipId",
      oldValue: order.assignedDriverMembershipId,
      newValue: targetMembershipId,
    });

    return { ok: true as const, order: updated };
  });
}
