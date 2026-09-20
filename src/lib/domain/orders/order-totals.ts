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
