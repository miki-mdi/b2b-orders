import type { OrderStatus } from "@prisma/client";
import { withTenantContext } from "@/lib/db/with-tenant";

export type DashboardMetrics = {
  statusCounts: Record<OrderStatus, number>;
  activeCustomers: number;
  activeProductUnits: number;
  recentOrders: {
    id: string;
    orderNumber: number;
    customerName: string;
    status: OrderStatus;
    createdAt: Date;
  }[];
};

const RECENT_ORDERS_LIMIT = 10;

const ZERO_STATUS_COUNTS: Record<OrderStatus, number> = {
  DRAFT: 0,
  SUBMITTED: 0,
  CONFIRMED: 0,
  CANCELLED: 0,
  PICKING: 0,
  READY: 0,
  OUT_FOR_DELIVERY: 0,
  DELIVERED: 0,
};

/**
 * Pilot-scale operational metrics for the seller dashboard (Phase 1E, §4).
 * Deliberately limited to counts/aggregates directly computable from
 * existing tables with a handful of cheap, indexed queries - no new
 * tables, no background aggregation job, no vanity metrics (page views,
 * etc. - nothing here isn't something a seller would act on operationally).
 *
 * One groupBy for the whole order-status breakdown (rather than one COUNT
 * query per status) keeps this at a fixed, small number of queries
 * regardless of how many statuses exist.
 */
export async function getDashboardMetrics(tenantId: string): Promise<DashboardMetrics> {
  return withTenantContext(tenantId, async (tx) => {
    const [statusGroups, activeCustomers, activeProductUnits, recentOrders] = await Promise.all([
      tx.order.groupBy({ by: ["status"], _count: { _all: true } }),
      tx.customer.count({ where: { isActive: true } }),
      tx.productUnit.count({ where: { isActive: true } }),
      tx.order.findMany({
        take: RECENT_ORDERS_LIMIT,
        orderBy: { createdAt: "desc" },
        select: { id: true, orderNumber: true, status: true, createdAt: true, customer: { select: { name: true } } },
      }),
    ]);

    const statusCounts: Record<OrderStatus, number> = { ...ZERO_STATUS_COUNTS };
    for (const group of statusGroups) {
      statusCounts[group.status] = group._count._all;
    }

    return {
      statusCounts,
      activeCustomers,
      activeProductUnits,
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customer.name,
        status: order.status,
        createdAt: order.createdAt,
      })),
    };
  });
}
