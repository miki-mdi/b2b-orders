import { getLocale, getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { hasCapability, orderReadStatusScopeFor } from "@/lib/auth/permissions";
import { getDashboardMetrics } from "@/lib/domain/dashboard/dashboard-service";
import { Link } from "@/i18n/navigation";
import { OrderStatusBadge } from "@/components/seller/order-status-badge";

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

/**
 * Phase 1F-B1: the same getDashboardMetrics() query/result every role
 * always used (no new queries per the brief) - only which cards, recent
 * orders, and quick-links get rendered varies by role. The recent-orders
 * filtering below isn't just cosmetic for Warehouse/Driver: it keeps the
 * dashboard from surfacing an order (number, customer name, status) those
 * roles' order-read scope (src/lib/auth/permissions.ts) wouldn't let them
 * open directly - see orderReadStatusScopeFor's use on the order list/detail
 * pages for the same restriction enforced at the data layer there.
 */
export default async function SellerDashboardPage() {
  const session = await requireSellerSession();
  const t = await getTranslations("seller.dashboard");
  const tOrders = await getTranslations("seller.orders");
  const tStatus = await getTranslations("seller.orders.status");
  const locale = await getLocale();

  const metrics = await getDashboardMetrics(session.tenantId);
  const canManageCatalog = hasCapability(session.role, "catalog:write");
  const canManageCustomers = hasCapability(session.role, "customers:write:full");
  const canManagePricing = hasCapability(session.role, "pricing:write");

  const orderScope = orderReadStatusScopeFor(session.role);
  let pipelineCards: { label: string; value: number }[];
  let recentOrders = metrics.recentOrders;
  if (orderScope) {
    recentOrders = recentOrders.filter((order) => orderScope.includes(order.status));
  }

  switch (session.role) {
    case "WAREHOUSE_WORKER":
      pipelineCards = [
        { label: t("confirmedCount"), value: metrics.statusCounts.CONFIRMED },
        { label: t("pickingCount"), value: metrics.statusCounts.PICKING },
        { label: t("readyCount"), value: metrics.statusCounts.READY },
      ];
      break;
    case "DELIVERY_DRIVER":
      pipelineCards = [
        { label: t("readyCount"), value: metrics.statusCounts.READY },
        { label: t("outForDeliveryCount"), value: metrics.statusCounts.OUT_FOR_DELIVERY },
        { label: t("deliveredCount"), value: metrics.statusCounts.DELIVERED },
      ];
      break;
    case "SALES_REP":
      pipelineCards = [
        { label: t("awaitingReview"), value: metrics.statusCounts.SUBMITTED },
        { label: t("confirmedCount"), value: metrics.statusCounts.CONFIRMED },
        { label: t("pickingCount"), value: metrics.statusCounts.PICKING },
        { label: t("readyCount"), value: metrics.statusCounts.READY },
        { label: t("outForDeliveryCount"), value: metrics.statusCounts.OUT_FOR_DELIVERY },
        { label: t("deliveredCount"), value: metrics.statusCounts.DELIVERED },
        { label: t("cancelledCount"), value: metrics.statusCounts.CANCELLED },
      ];
      break;
    default:
      pipelineCards = [
        { label: t("awaitingReview"), value: metrics.statusCounts.SUBMITTED },
        { label: t("confirmedCount"), value: metrics.statusCounts.CONFIRMED },
        { label: t("pickingCount"), value: metrics.statusCounts.PICKING },
        { label: t("readyCount"), value: metrics.statusCounts.READY },
        { label: t("outForDeliveryCount"), value: metrics.statusCounts.OUT_FOR_DELIVERY },
        { label: t("deliveredCount"), value: metrics.statusCounts.DELIVERED },
        { label: t("cancelledCount"), value: metrics.statusCounts.CANCELLED },
        { label: t("activeCustomers"), value: metrics.activeCustomers },
        { label: t("activeProducts"), value: metrics.activeProductUnits },
      ];
  }

  const quickLinks = [
    ...(canManageCatalog
      ? [
          { href: "/seller/categories" as const, label: t("categoriesCard") },
          { href: "/seller/units" as const, label: t("unitsCard") },
          { href: "/seller/products" as const, label: t("productsCard") },
        ]
      : []),
    ...(canManageCustomers ? [{ href: "/seller/customers" as const, label: t("customersCard") }] : []),
    ...(canManagePricing ? [{ href: "/seller/price-lists" as const, label: t("priceListsCard") }] : []),
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t("metricsTitle")}</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {pipelineCards.map((card) => (
            <MetricCard key={card.label} label={card.label} value={card.value} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t("recentActivityTitle")}</h2>
        {recentOrders.length === 0 ? (
          <p className="rounded border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
            {t("recentActivityEmpty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tOrders("columnNumber")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tOrders("columnCustomer")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tOrders("columnDate")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tOrders("columnStatus")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    <span className="sr-only">{tOrders("viewDetail")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-4 py-2">{order.orderNumber}</td>
                    <td className="px-4 py-2">{order.customerName}</td>
                    <td className="px-4 py-2">{order.createdAt.toLocaleDateString(locale)}</td>
                    <td className="px-4 py-2">
                      <OrderStatusBadge status={order.status} label={tStatus(order.status)} />
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/seller/orders/${order.id}`} className="text-sm underline underline-offset-2">
                        {tOrders("viewDetail")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {quickLinks.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t("quickLinksTitle")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {quickLinks.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="rounded-lg border border-zinc-200 p-4 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                {card.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
