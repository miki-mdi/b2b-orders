/**
 * Pure, server-only arithmetic shared by the cart/checkout preview and the
 * order history/detail screens, so "what the buyer is about to pay" and
 * "what a past order actually shows" are computed by the exact same rule.
 * Never trusts a total computed anywhere else (browser, client component
 * state) - see docs/SECURITY_AND_MULTI_TENANCY.md §12 "never trust a
 * client-supplied price".
 */

export type OrderLineForTotals = {
  requestedQty: number;
  confirmedQty?: number | null;
  unitPriceAtOrderTime: number;
  discountPercentAtOrderTime?: number | null;
  vatRateAtOrderTime: number;
};

export type LineTotals = {
  netUnitPrice: number;
  subtotal: number;
  vat: number;
  total: number;
};

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Uses confirmedQty once a seller has adjusted it (Phase 1D), falling back
 * to requestedQty beforehand - a SUBMITTED order (all Phase 1C ever
 * produces) always has confirmedQty === null, so this always resolves to
 * requestedQty today, but the totals helper is written once for both cases
 * so Phase 1D's confirmation screen doesn't need a second implementation.
 */
export function computeLineTotals(line: OrderLineForTotals): LineTotals {
  const qty = line.confirmedQty ?? line.requestedQty;
  const discount = line.discountPercentAtOrderTime ?? 0;
  const netUnitPrice = round2(line.unitPriceAtOrderTime * (1 - discount / 100));
  const subtotal = round2(netUnitPrice * qty);
  const vat = round2(subtotal * (line.vatRateAtOrderTime / 100));
  const total = round2(subtotal + vat);
  return { netUnitPrice, subtotal, vat, total };
}

export type OrderTotals = { subtotal: number; vat: number; total: number };

export function computeOrderTotals(lines: OrderLineForTotals[]): OrderTotals {
  return lines.reduce<OrderTotals>(
    (acc, line) => {
      const lineTotals = computeLineTotals(line);
      return {
        subtotal: round2(acc.subtotal + lineTotals.subtotal),
        vat: round2(acc.vat + lineTotals.vat),
        total: round2(acc.total + lineTotals.total),
      };
    },
    { subtotal: 0, vat: 0, total: 0 }
  );
}

/**
 * The order EXACTLY as the buyer submitted it, ignoring any seller
 * confirmation adjustment - Phase 1D's "original submitted totals remain
 * preserved as a historical snapshot" rule (docs/SESSION_HANDOFF.md §10).
 * This never mutates or re-derives requestedQty/the price snapshot fields;
 * it simply computes totals as if confirmedQty had never been set, from
 * the exact same immutable fields computeOrderTotals reads.
 */
export function computeSubmittedOrderTotals(lines: OrderLineForTotals[]): OrderTotals {
  return computeOrderTotals(lines.map((line) => ({ ...line, confirmedQty: null })));
}

export type LineFulfillment = {
  requestedQty: number;
  confirmedQty: number | null;
  unavailableQty: number | null;
};

/**
 * Partial fulfillment is represented per line, not as a separate top-level
 * order status (docs/ORDER_WORKFLOW.md §1, item 1 - "PARTIALLY_CONFIRMED
 * as a top-level status is ambiguous" was already rejected in that
 * decision). `unavailableQty` is purely derived (requestedQty -
 * confirmedQty), never its own stored field - there is nothing to keep in
 * sync since it's computed fresh from the two columns that already exist.
 */
export function computeLineFulfillment(line: {
  requestedQty: number;
  confirmedQty?: number | null;
}): LineFulfillment {
  const confirmedQty = line.confirmedQty ?? null;
  return {
    requestedQty: line.requestedQty,
    confirmedQty,
    unavailableQty: confirmedQty != null ? round2(line.requestedQty - confirmedQty) : null,
  };
}
