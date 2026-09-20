import type { Prisma } from "@prisma/client";
import { withCustomerContext, withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";
import { isUniqueConstraintError } from "@/lib/domain/shared/errors";
import { resolveCartLine, type ResolvedCartLine } from "./cart-resolution";
import { isPastCutOffForDelivery } from "./cutoff";

export class OrderNotFoundError extends Error {}
export class OrderNotCancellableError extends Error {}

/** Buyer-side: this customer's own orders, most recent first, with lines for the list/history totals. */
export function listOrdersForCustomer(tenantId: string, customerId: string) {
  return withCustomerContext(tenantId, customerId, (tx) =>
    tx.order.findMany({ include: { lines: true }, orderBy: { createdAt: "desc" } })
  );
}

/** Buyer-side: one order, scoped to this customer - returns null if it belongs to another customer. */
export function getOrderForCustomer(tenantId: string, customerId: string, orderId: string) {
  return withCustomerContext(tenantId, customerId, (tx) =>
    tx.order.findUnique({ where: { id: orderId }, include: { lines: true } })
  );
}

/** Seller-side: one order across the whole tenant, regardless of which customer placed it. */
export function getOrderForTenant(tenantId: string, orderId: string) {
  return withTenantContext(tenantId, (tx) => tx.order.findUnique({ where: { id: orderId }, include: { lines: true } }));
}

/** Buyer-side: the tenant's cut-off configuration, for the checkout warning (docs/ORDER_WORKFLOW.md §5). */
export function getTenantCutOffInfo(tenantId: string, customerId: string) {
  return withCustomerContext(tenantId, customerId, (tx) =>
    tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { cutOffTime: true } })
  );
}

export type SubmitOrderLine = { productUnitId: string; quantity: number };

export type SubmitOrderInput = {
  deliveryAddressId: string;
  note?: string;
  requestedDeliveryDate?: Date;
  lines: SubmitOrderLine[];
};

export type SubmitOrderLineIssue = { productUnitId: string; issue: Extract<ResolvedCartLine, { ok: false }>["issue"] };

export type SubmitOrderResult =
  | { ok: true; order: Prisma.OrderGetPayload<{ include: { lines: true } }> }
  | { ok: false; reason: "EMPTY_CART" }
  | { ok: false; reason: "LINE_ISSUES"; lineIssues: SubmitOrderLineIssue[] }
  | { ok: false; reason: "CUSTOMER_INACTIVE" }
  | { ok: false; reason: "ADDRESS_NOT_FOUND" };

const MAX_ORDER_NUMBER_ATTEMPTS = 5;

/**
 * The one place a buyer's order gets written. Every line is fully
 * re-resolved (price, visibility, active state, min-qty/increment) via
 * resolveCartLine right before the write - nothing about price, discount,
 * VAT, or eligibility is ever taken from the caller's `input`, only
 * productUnitId + the requested quantity (see docs/SECURITY_AND_MULTI_TENANCY.md).
 * If ANY line is no longer valid, the whole submission is rejected rather
 * than silently dropping lines - simpler and safer for MVP than a partial
 * order the buyer didn't ask for.
 */
export async function submitOrder(
  tenantId: string,
  customerId: string,
  actorUserId: string,
  actorName: string,
  actorRole: string,
  input: SubmitOrderInput
): Promise<SubmitOrderResult> {
  if (input.lines.length === 0) {
    return { ok: false, reason: "EMPTY_CART" };
  }

  const resolvedLines = await Promise.all(
    input.lines.map((line) => resolveCartLine(tenantId, customerId, line.productUnitId, line.quantity))
  );
  const lineIssues: SubmitOrderLineIssue[] = [];
  const okLines: Extract<ResolvedCartLine, { ok: true }>[] = [];
  for (const line of resolvedLines) {
    if (line.ok) {
      okLines.push(line);
    } else {
      lineIssues.push({ productUnitId: line.productUnitId, issue: line.issue });
    }
  }
  if (lineIssues.length > 0) {
    return { ok: false, reason: "LINE_ISSUES", lineIssues };
  }

  for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
    const result = await attemptSubmitOrder(tenantId, customerId, actorUserId, actorName, actorRole, input, okLines);
    if (result.kind === "DONE") return result.value;
  }
  throw new Error("Could not allocate an order number after several attempts - please try again.");
}

async function attemptSubmitOrder(
  tenantId: string,
  customerId: string,
  actorUserId: string,
  actorName: string,
  actorRole: string,
  input: SubmitOrderInput,
  okLines: Extract<ResolvedCartLine, { ok: true }>[]
): Promise<{ kind: "CONFLICT" } | { kind: "DONE"; value: SubmitOrderResult }> {
  // Order numbering must see every order under the TENANT, not just this
  // customer's - RLS's Tier 2 customer-narrowing (prisma/rls/policies.sql)
  // means a withCustomerContext transaction can only ever see its own
  // customer's Order rows, by design, even via a raw query. Two different
  // customers each computing "next number" from their own (empty) view
  // would both land on 1 and collide - this happened in testing. This read
  // is a tenant-only aggregate (no row content, just a count), run in its
  // own withTenantContext transaction; the actual write below stays
  // customer-scoped so address/customer ownership checks keep their normal
  // enforcement.
  const orderNumber = await withTenantContext(tenantId, async (txTenant) => {
    const last = await txTenant.order.aggregate({ _max: { orderNumber: true } });
    return (last._max.orderNumber ?? 0) + 1;
  });

  try {
    return await withCustomerContext(tenantId, customerId, async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer || !customer.isActive) {
        return { kind: "DONE" as const, value: { ok: false as const, reason: "CUSTOMER_INACTIVE" as const } };
      }

      const address = await tx.customerAddress.findUnique({ where: { id: input.deliveryAddressId } });
      if (!address || !address.isActive) {
        return { kind: "DONE" as const, value: { ok: false as const, reason: "ADDRESS_NOT_FOUND" as const } };
      }

      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const cutOffWarningShown = isPastCutOffForDelivery(tenant, input.requestedDeliveryDate ?? null);

      const order = await tx.order.create({
        data: {
          tenantId,
          customerId,
          orderNumber,
          status: "SUBMITTED",
          placedByUserId: actorUserId,
          placedByName: actorName,
          placedByRole: actorRole,
          deliveryAddressId: address.id,
          // Full historical snapshot - see docs/DATABASE_DESIGN.md §6. Never
          // re-read live through deliveryAddressId once written.
          deliveryAddressSnapshot: {
            recipientName: address.recipientName,
            addressLine1: address.addressLine1,
            addressLine2: address.addressLine2,
            city: address.city,
            postalCode: address.postalCode,
            country: address.country,
          },
          requestedDeliveryDate: input.requestedDeliveryDate ?? null,
          cutOffWarningShown,
          note: input.note ?? null,
          submittedAt: new Date(),
          lines: {
            create: okLines.map((line) => ({
              productUnitId: line.productUnitId,
              productNameSnapshot: line.productNameEn,
              productSkuSnapshot: line.productSku,
              unitLabelSnapshot: line.unitLabel,
              requestedQty: line.requestedQty,
              unitPriceAtOrderTime: line.basePrice,
              discountPercentAtOrderTime: line.discountPercent,
              vatRateAtOrderTime: line.vatRate,
            })),
          },
        },
        include: { lines: true },
      });

      await writeAuditLogEntry(tx, {
        tenantId,
        actorUserId,
        actingContext: "CUSTOMER",
        entityType: "Order",
        entityId: order.id,
        action: "CREATE",
        newValue: order,
      });

      return { kind: "DONE" as const, value: { ok: true as const, order } };
    });
  } catch (error) {
    // (tenantId, orderNumber) collision under concurrent submissions for the
    // same tenant - retried with a freshly-read max() in a brand new
    // transaction by the caller, never inside this same aborted one.
    if (isUniqueConstraintError(error)) {
      return { kind: "CONFLICT" };
    }
    throw error;
  }
}

/**
 * Buyer-initiated cancellation - locked MVP rule (docs/ORDER_WORKFLOW.md §3):
 * only while SUBMITTED, resolves immediately, no seller approval step. Once
 * CONFIRMED or later, only a seller can cancel (Phase 1D+, not this
 * function). No schema change was needed for this - `Order.status` already
 * has CANCELLED and `cancelledBy`/`cancelReason` already exist.
 */
export async function requestOrderCancellation(
  tenantId: string,
  customerId: string,
  actorUserId: string,
  orderId: string,
  reason?: string
) {
  return withCustomerContext(tenantId, customerId, async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new OrderNotFoundError("Order not found.");
    }
    if (order.status !== "SUBMITTED") {
      throw new OrderNotCancellableError(
        "Only an order that is still awaiting seller confirmation can be cancelled by the buyer."
      );
    }

    const after = await tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", cancelledBy: "BUYER", cancelReason: reason ?? null },
    });

    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "CUSTOMER",
      entityType: "Order",
      entityId: orderId,
      action: "UPDATE",
      oldValue: { status: order.status },
      newValue: { status: after.status, cancelledBy: after.cancelledBy, cancelReason: after.cancelReason },
      reason,
    });

    return after;
  });
}
