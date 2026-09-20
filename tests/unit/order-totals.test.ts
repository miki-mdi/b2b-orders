import { describe, expect, it } from "vitest";
import { computeLineTotals, computeOrderTotals, round2 } from "@/lib/domain/orders/order-totals";

describe("computeLineTotals", () => {
  it("computes subtotal/vat/total with no discount", () => {
    const totals = computeLineTotals({
      requestedQty: 5,
      unitPriceAtOrderTime: 100,
      discountPercentAtOrderTime: null,
      vatRateAtOrderTime: 18,
    });
    expect(totals).toEqual({ netUnitPrice: 100, subtotal: 500, vat: 90, total: 590 });
  });

  it("applies the discount before computing subtotal, then VAT after", () => {
    const totals = computeLineTotals({
      requestedQty: 2,
      unitPriceAtOrderTime: 100,
      discountPercentAtOrderTime: 10,
      vatRateAtOrderTime: 18,
    });
    // net unit = 90, subtotal = 180, vat = 32.4, total = 212.4
    expect(totals).toEqual({ netUnitPrice: 90, subtotal: 180, vat: 32.4, total: 212.4 });
  });

  it("uses confirmedQty over requestedQty once a seller has adjusted it", () => {
    const totals = computeLineTotals({
      requestedQty: 10,
      confirmedQty: 6,
      unitPriceAtOrderTime: 50,
      discountPercentAtOrderTime: null,
      vatRateAtOrderTime: 0,
    });
    expect(totals.subtotal).toBe(300);
  });

  it("rounds to 2 decimal places", () => {
    const totals = computeLineTotals({
      requestedQty: 3,
      unitPriceAtOrderTime: 99.99,
      discountPercentAtOrderTime: 33.33,
      vatRateAtOrderTime: 18,
    });
    expect(totals.netUnitPrice).toBe(66.66);
  });
});

describe("computeOrderTotals", () => {
  it("sums totals across multiple lines", () => {
    const totals = computeOrderTotals([
      { requestedQty: 1, unitPriceAtOrderTime: 100, discountPercentAtOrderTime: null, vatRateAtOrderTime: 18 },
      { requestedQty: 2, unitPriceAtOrderTime: 50, discountPercentAtOrderTime: null, vatRateAtOrderTime: 0 },
    ]);
    // line 1: 100 subtotal, 18 vat -> 118 total; line 2: 100 subtotal, 0 vat -> 100 total
    expect(totals).toEqual({ subtotal: 200, vat: 18, total: 218 });
  });

  it("returns zero totals for an empty order", () => {
    expect(computeOrderTotals([])).toEqual({ subtotal: 0, vat: 0, total: 0 });
  });
});

describe("round2", () => {
  it("rounds half up to 2 decimals", () => {
    expect(round2(1.005)).toBeCloseTo(1.01, 2);
    expect(round2(1.004)).toBe(1);
  });
});
