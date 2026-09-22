import { withTenantContext } from "@/lib/db/with-tenant";
import { computeSubmittedOrderTotals, round2, type OrderLineForTotals } from "@/lib/domain/orders/order-totals";
import type { DashboardDateRange } from "./date-range";

export type TopProduct = {
  sku: string;
  name: string;
  unitLabel: string;
  requestedQty: number;
};

export type SalesAnalytics = {
  submittedOrderValue: number;
  orderCount: number;
  topProducts: TopProduct[];
};

const TOP_PRODUCTS_LIMIT = 10;

/**
 * Phase 1F-B2: "Submitted order value" and "Top products" for the Seller
 * Admin / Sales Rep dashboard, gated behind the `dashboard:sales-analytics`
 * capability (src/lib/auth/permissions.ts) - Warehouse Worker / Delivery
 * Driver sessions never call this function.
 *
 * Both aggregates are computed only from the fields submitOrder() already
 * snapshots at submission time (unitPriceAtOrderTime,
 * discountPercentAtOrderTime, vatRateAtOrderTime, requestedQty,
 * productSkuSnapshot/unitLabelSnapshot/productNameSnapshot) - never from
 * confirmedQty, live catalog data, or the current price list. This is
 * deliberate, not incidental: `computeSubmittedOrderTotals`
 * (order-totals.ts) is the same function that already backs the order
 * detail page's permanent historical record (docs/SESSION_HANDOFF.md §11) -
 * a period's numbers here must never change later just because a seller
 * confirms an old order at a reduced quantity, or a price list is edited
 * afterwards. Every non-CANCELLED order with a submittedAt in range counts;
 * DRAFT orders never have submittedAt set by any path in this codebase, so
 * they're excluded by the date filter itself, not a separate status check.
 *
 * Two queries, both O(1) regardless of tenant size (bounded by the
 * date-range/365-day cap enforced in date-range.ts), no per-row loop:
 *  - one `order.findMany` with its lines included, totalled in memory via
 *    the existing pure computeSubmittedOrderTotals (matches the same
 *    include-then-compute-in-JS pattern src/lib/domain/export/export-service.ts
 *    already uses for the same reason - line totals need per-line
 *    discount/VAT rounding, not a raw SQL sum).
 *  - one `orderLine.groupBy` DB-side aggregate for the top-products ranking.
 * `OrderLine` has no `tenantId` column of its own and isn't in
 * TENANT_SCOPED_MODELS (src/lib/db/tenant-scoped-models.ts), so - exactly
 * like the existing exportOrderLinesCsv - its tenant isolation here comes
 * from RLS alone (via the join to Order.tenantId), not from Layer 2.
 */
export async function getSalesAnalytics(tenantId: string, range: DashboardDateRange): Promise<SalesAnalytics> {
  return withTenantContext(tenantId, async (tx) => {
    const [orders, productGroups] = await Promise.all([
      tx.order.findMany({
        where: { submittedAt: { gte: range.from, lt: range.to }, status: { not: "CANCELLED" } },
        select: {
          lines: {
            select: {
              requestedQty: true,
              unitPriceAtOrderTime: true,
              discountPercentAtOrderTime: true,
              vatRateAtOrderTime: true,
            },
          },
        },
      }),
      tx.orderLine.groupBy({
        by: ["productSkuSnapshot", "unitLabelSnapshot"],
        where: { order: { submittedAt: { gte: range.from, lt: range.to }, status: { not: "CANCELLED" } } },
        _sum: { requestedQty: true },
        _max: { productNameSnapshot: true },
        orderBy: { _sum: { requestedQty: "desc" } },
        take: TOP_PRODUCTS_LIMIT,
      }),
    ]);

    const submittedOrderValue = orders.reduce((sum, order) => {
      const lines: OrderLineForTotals[] = order.lines.map((line) => ({
        requestedQty: Number(line.requestedQty),
        confirmedQty: null,
        unitPriceAtOrderTime: Number(line.unitPriceAtOrderTime),
        discountPercentAtOrderTime: line.discountPercentAtOrderTime != null ? Number(line.discountPercentAtOrderTime) : null,
        vatRateAtOrderTime: Number(line.vatRateAtOrderTime),
      }));
      return round2(sum + computeSubmittedOrderTotals(lines).total);
    }, 0);

    const topProducts: TopProduct[] = productGroups.map((group) => ({
      sku: group.productSkuSnapshot,
      unitLabel: group.unitLabelSnapshot,
      name: group._max.productNameSnapshot ?? group.productSkuSnapshot,
      requestedQty: Number(group._sum.requestedQty ?? 0),
    }));

    return { submittedOrderValue, orderCount: orders.length, topProducts };
  });
}
