import type { ActingContext, OrderStatus, Prisma } from "@prisma/client";
import { withCustomerContext, withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";
import { isUniqueConstraintError } from "@/lib/domain/shared/errors";
import { clampPage, clampPageSize, clampSearchTerm, toPageResult, type PageResult } from "@/lib/pagination";
import { resolveCartLine, type ResolvedCartLine } from "./cart-resolution";
import { isPastCutOffForDelivery } from "./cutoff";
import { publishOrderEvent } from "./order-events";
import { isValidOrderTransition } from "./order-status-machine";

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
  return withTenantContext(tenantId, (tx) =>
    tx.order.findUnique({ where: { id: orderId }, include: { lines: true, customer: true } })
  );
}

export type OrderInboxFilter = { status?: OrderStatus; search?: string };

/**
 * Seller-side inbox: every order under the tenant, optionally filtered by
 * status and/or a search string matched against the order number (exact,
 * when the search text is purely numeric) or the customer's name.
 */
export function listOrdersForTenant(tenantId: string, filter: OrderInboxFilter = {}) {
  return withTenantContext(tenantId, (tx) => {
    const search = filter.search?.trim();
    const orderNumberSearch = search && /^\d+$/.test(search) ? Number(search) : undefined;

    return tx.order.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(search
          ? {
              OR: [
                ...(orderNumberSearch !== undefined ? [{ orderNumber: orderNumberSearch }] : []),
                { customer: { name: { contains: search, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      include: { lines: true, customer: true },
      orderBy: { createdAt: "desc" },
    });
  });
}

export type OrderInboxPageRequest = { status?: OrderStatus; search?: string; page?: number; pageSize?: number };

function orderInboxWhere(filter: OrderInboxFilter) {
  const search = clampSearchTerm(filter.search);
  const orderNumberSearch = search && /^\d+$/.test(search) ? Number(search) : undefined;

  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(search
      ? {
          OR: [
            ...(orderNumberSearch !== undefined ? [{ orderNumber: orderNumberSearch }] : []),
            { customer: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

/**
 * Paginated variant of listOrdersForTenant for the seller order inbox UI
 * (Phase 1E, §8) - server-side pagination so an established pilot tenant's
 * full order history is never loaded into one page. listOrdersForTenant
 * itself is left unpaginated/unchanged for its other callers (tests, and
 * any future internal use that genuinely needs the full set).
 */
export function listOrdersForTenantPage(
  tenantId: string,
  request: OrderInboxPageRequest = {}
): Promise<PageResult<Prisma.OrderGetPayload<{ include: { lines: true; customer: true } }>>> {
  const page = clampPage(request.page);
  const pageSize = clampPageSize(request.pageSize);
  const where = orderInboxWhere(request);

  return withTenantContext(tenantId, async (tx) => {
    const [items, total] = await Promise.all([
      tx.order.findMany({
        where,
        include: { lines: true, customer: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      tx.order.count({ where }),
    ]);
    return toPageResult(items, total, page, pageSize);
  });
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
 * The one place an order gets written - used by BOTH the buyer's own
 * checkout (Phase 1C, actingContext "CUSTOMER") and a seller entering an
 * order on a customer's behalf (Phase 1D, actingContext "TENANT"). Every
 * line is fully re-resolved (price, visibility, active state,
 * min-qty/increment) via resolveCartLine right before the write - nothing
 * about price, discount, VAT, or eligibility is ever taken from the
 * caller's `input`, only productUnitId + the requested quantity (see
 * docs/SECURITY_AND_MULTI_TENANCY.md). A seller gets no special treatment
 * here: the exact same customer-specific pricing/visibility/min-qty rules
 * apply regardless of who is placing the order, per the Phase 1D brief.
 * If ANY line is no longer valid, the whole submission is rejected rather
 * than silently dropping lines - simpler and safer for MVP than a partial
 * order nobody asked for.
 */
export async function submitOrder(
  tenantId: string,
  customerId: string,
  actorUserId: string,
  actorName: string,
  actorRole: string,
  actingContext: ActingContext,
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

  let result: SubmitOrderResult | undefined;
  for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
    const attemptResult = await attemptSubmitOrder(
      tenantId,
      customerId,
      actorUserId,
      actorName,
      actorRole,
      actingContext,
      input,
      okLines
    );
    if (attemptResult.kind === "DONE") {
      result = attemptResult.value;
      break;
    }
  }
  if (!result) {
    throw new Error("Could not allocate an order number after several attempts - please try again.");
  }

  if (result.ok) {
    await publishOrderEvent({
      type: "SUBMITTED",
      tenantId,
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      customerId,
      actorUserId,
      occurredAt: new Date(),
    });
  }
  return result;
}

async function attemptSubmitOrder(
  tenantId: string,
  customerId: string,
  actorUserId: string,
  actorName: string,
  actorRole: string,
  actingContext: ActingContext,
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
        actingContext,
        entityType: "Order",
        entityId: order.id,
        action: "CREATE",
        newValue: order,
        ...(actingContext === "TENANT" ? { reason: "Entered by seller on behalf of customer" } : {}),
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
  const after = await withCustomerContext(tenantId, customerId, async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new OrderNotFoundError("Order not found.");
    }
    if (!isValidOrderTransition(order.status, "CANCELLED")) {
      throw new OrderNotCancellableError(
        "Only an order that is still awaiting seller confirmation can be cancelled by the buyer."
      );
    }

    const updated = await tx.order.update({
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
      fieldName: "status",
      oldValue: order.status,
      newValue: updated.status,
      reason,
    });

    return updated;
  });

  await publishOrderEvent({
    type: "CANCELLED",
    tenantId,
    orderId: after.id,
    orderNumber: after.orderNumber,
    customerId,
    actorUserId,
    occurredAt: new Date(),
  });

  return after;
}
