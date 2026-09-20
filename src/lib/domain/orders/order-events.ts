/**
 * Basic application-level order events - the documented extension point for
 * a future real notification channel (email/SMS/push), per the Phase 1D
 * brief's explicit instruction NOT to integrate any external service yet.
 *
 * Deliberately not a database table: a `Notification` row per event would
 * need its own tenant/customer scoping, RLS policy, and read/unread UI for
 * something nothing in Phase 1D actually reads back - the operationally
 * meaningful record of "what happened to this order and why" is already
 * `AuditLogEntry` (see docs/SECURITY_AND_MULTI_TENANCY.md §7), which every
 * caller below already writes in the same transaction as the change this
 * event describes. This module exists purely so a future notification
 * provider has exactly one place to subscribe, instead of every call site
 * that changes an order's status needing to know about it directly.
 *
 * Usage: call `publishOrderEvent` AFTER the write transaction that produced
 * it has committed (never from inside a withTenantContext/withCustomerContext
 * callback) - a listener here is not transactional, and a future real
 * listener (e.g. "send an email") should never be able to roll back an
 * order change if it fails.
 */
export type OrderEventType =
  | "SUBMITTED"
  | "CONFIRMED"
  | "PICKING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export type OrderEvent = {
  type: OrderEventType;
  tenantId: string;
  orderId: string;
  orderNumber: number;
  customerId: string;
  actorUserId: string | null;
  occurredAt: Date;
};

export type OrderEventListener = (event: OrderEvent) => void | Promise<void>;

const listeners = new Set<OrderEventListener>();

/** Registers a listener. Returns an unsubscribe function - mainly useful for tests. */
export function onOrderEvent(listener: OrderEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Fire-and-forget by design: a listener throwing must never surface as a
 * failure of the order operation that already succeeded and committed.
 * Errors are swallowed after being logged, not re-thrown.
 */
export async function publishOrderEvent(event: OrderEvent): Promise<void> {
  for (const listener of listeners) {
    try {
      await listener(event);
    } catch (error) {
      console.error(`[order-events] listener failed for ${event.type} on order ${event.orderId}:`, error);
    }
  }
}

// The default (and, for now, only) listener: a structured log line. Swap or
// add to this in one place once a real notification channel exists -
// nothing else in the codebase needs to change.
onOrderEvent((event) => {
  console.log(
    `[order-event] ${event.type} tenant=${event.tenantId} order=${event.orderId} (#${event.orderNumber}) customer=${event.customerId} actor=${event.actorUserId ?? "system"} at=${event.occurredAt.toISOString()}`
  );
});
