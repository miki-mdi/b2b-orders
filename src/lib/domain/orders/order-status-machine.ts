import type { OrderStatus } from "@prisma/client";

/**
 * The single source of truth for which order-status transitions are legal.
 * Every seller-side status change (confirmOrder, advanceOrderStatus in
 * order-fulfillment-service.ts) and the buyer's own cancellation
 * (requestOrderCancellation in order-service.ts) goes through
 * assertValidTransition rather than writing `status` directly, so the rule
 * lives in exactly one place instead of being scattered across Server
 * Actions - per the Phase 1D brief's explicit requirement.
 *
 * Scope, per docs/ORDER_WORKFLOW.md §2-3 and the locked Phase 1D brief:
 *   SUBMITTED -> CONFIRMED -> PICKING -> READY -> OUT_FOR_DELIVERY -> DELIVERED
 *   SUBMITTED -> CANCELLED (buyer-only, see order-service.ts)
 *
 * Deliberately NOT implemented here (out of Phase 1D scope, per
 * docs/ORDER_WORKFLOW.md §3: "handled manually by the Seller Admin, not a
 * guided flow"): seller-initiated cancellation from CONFIRMED or later.
 * `DRAFT` has no outgoing transition modeled either - nothing in this
 * codebase creates a DRAFT order (the buyer/seller flows both submit
 * directly into SUBMITTED); it is reserved schema for a possible future
 * "save for later" cart.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: [],
  SUBMITTED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PICKING"],
  PICKING: ["READY"],
  READY: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function isValidOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export class InvalidOrderTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus
  ) {
    super(`Cannot move an order from ${from} to ${to}.`);
    this.name = "InvalidOrderTransitionError";
  }
}

export function assertValidOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!isValidOrderTransition(from, to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}
