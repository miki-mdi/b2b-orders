import type { SVGProps } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { hasCapability, orderReadStatusScopeFor } from "@/lib/auth/permissions";
import { getDashboardMetrics } from "@/lib/domain/dashboard/dashboard-service";
import { resolveDashboardDateRange, type DashboardDateRangeOption } from "@/lib/domain/dashboard/date-range";
import { getSalesAnalytics } from "@/lib/domain/dashboard/sales-analytics-service";
import { Link } from "@/i18n/navigation";
import { OrderStatusBadge } from "@/components/seller/order-status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { inputStyles } from "@/components/ui/form-field";
import { Tabs, type TabItem } from "@/components/ui/tabs";

const RANGE_LABEL_KEYS: Record<DashboardDateRangeOption, string> = {
  today: "rangeToday",
  week: "rangeWeek",
  month: "rangeMonth",
  custom: "rangeCustom",
};

/**
 * Small, local-only icons for the quick-action cards below - same
 * hand-written inline-SVG convention as the sign-in screen's icons
 * (no icon library, no new asset). Kept local to this page rather than
 * promoted to a shared file since they're specific to these five links.
 */
function OrdersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

function CategoriesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 7a2 2 0 0 1 2-2h3.5l2 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

function UnitsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="9" width="18" height="6" rx="1.5" />
      <path d="M7 9v3M11 9v3M15 9v3" />
    </svg>
  );
}

function ProductsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 3 4.5 7v10L12 21l7.5-4V7L12 3Z" />
      <path d="M4.5 7 12 11l7.5-4M12 11v10" />
    </svg>
  );
}

function CustomersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="16.5" cy="9.5" r="2.3" />
      <path d="M3.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6M14.8 14.6c2.3.5 3.9 2.6 3.9 5.4" />
    </svg>
  );
}

function PriceTagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12.6 3H20v7.4L10.4 20 3 12.6 12.6 3Z" />
      <circle cx="16" cy="7" r="1.2" fill="currentColor" stroke="none" />
    </svg>
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
 *
 * Design Phase 2: presentation-only redesign of this one page - same data
 * fetching, same capability gates, same routes/actions as before. Only new
 * addition is an "Orders" quick-action card (the route already exists and
 * is already linked from the nav/order list/new-order flow; every role has
 * some order-read capability, same as the sidebar nav's own unconditional
 * Orders link - see SellerLayout).
 */
export default async function SellerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const session = await requireSellerSession();
  const t = await getTranslations("seller.dashboard");
  const tOrders = await getTranslations("seller.orders");
  const tStatus = await getTranslations("seller.orders.status");
  const locale = await getLocale();
  const rangeInput = await searchParams;

  const metrics = await getDashboardMetrics(session.tenantId);
  const canManageCatalog = hasCapability(session.role, "catalog:write");
  const canManageCustomers = hasCapability(session.role, "customers:write:full");
  const canManagePricing = hasCapability(session.role, "pricing:write");
  const canViewSalesAnalytics = hasCapability(session.role, "dashboard:sales-analytics");

  // Gated before invocation, not just hidden in the rendered UI - Warehouse
  // Worker / Delivery Driver sessions never run either analytics query.
  const dateRangeResult = canViewSalesAnalytics ? resolveDashboardDateRange(rangeInput) : null;
  const effectiveRange = dateRangeResult ? (dateRangeResult.ok ? dateRangeResult.value : dateRangeResult.fallback) : null;
  const salesAnalytics = effectiveRange ? await getSalesAnalytics(session.tenantId, effectiveRange) : null;

  const orderScope = orderReadStatusScopeFor(session.role);
  let pipelineCards: { key: string; label: string; value: number }[];
  let recentOrders = metrics.recentOrders;
  if (orderScope) {
    recentOrders = recentOrders.filter((order) => orderScope.includes(order.status));
  }

  switch (session.role) {
    case "WAREHOUSE_WORKER":
      pipelineCards = [
        { key: "confirmedCount", label: t("confirmedCount"), value: metrics.statusCounts.CONFIRMED },
        { key: "pickingCount", label: t("pickingCount"), value: metrics.statusCounts.PICKING },
        { key: "readyCount", label: t("readyCount"), value: metrics.statusCounts.READY },
      ];
      break;
    case "DELIVERY_DRIVER":
      pipelineCards = [
        { key: "readyCount", label: t("readyCount"), value: metrics.statusCounts.READY },
        { key: "outForDeliveryCount", label: t("outForDeliveryCount"), value: metrics.statusCounts.OUT_FOR_DELIVERY },
        { key: "deliveredCount", label: t("deliveredCount"), value: metrics.statusCounts.DELIVERED },
      ];
      break;
    case "SALES_REP":
      pipelineCards = [
        { key: "awaitingReview", label: t("awaitingReview"), value: metrics.statusCounts.SUBMITTED },
        { key: "confirmedCount", label: t("confirmedCount"), value: metrics.statusCounts.CONFIRMED },
        { key: "pickingCount", label: t("pickingCount"), value: metrics.statusCounts.PICKING },
        { key: "readyCount", label: t("readyCount"), value: metrics.statusCounts.READY },
        { key: "outForDeliveryCount", label: t("outForDeliveryCount"), value: metrics.statusCounts.OUT_FOR_DELIVERY },
        { key: "deliveredCount", label: t("deliveredCount"), value: metrics.statusCounts.DELIVERED },
        { key: "cancelledCount", label: t("cancelledCount"), value: metrics.statusCounts.CANCELLED },
      ];
      break;
    default:
      pipelineCards = [
        { key: "awaitingReview", label: t("awaitingReview"), value: metrics.statusCounts.SUBMITTED },
        { key: "confirmedCount", label: t("confirmedCount"), value: metrics.statusCounts.CONFIRMED },
        { key: "pickingCount", label: t("pickingCount"), value: metrics.statusCounts.PICKING },
        { key: "readyCount", label: t("readyCount"), value: metrics.statusCounts.READY },
        { key: "outForDeliveryCount", label: t("outForDeliveryCount"), value: metrics.statusCounts.OUT_FOR_DELIVERY },
        { key: "deliveredCount", label: t("deliveredCount"), value: metrics.statusCounts.DELIVERED },
        { key: "cancelledCount", label: t("cancelledCount"), value: metrics.statusCounts.CANCELLED },
        { key: "activeCustomers", label: t("activeCustomers"), value: metrics.activeCustomers },
        { key: "activeProducts", label: t("activeProducts"), value: metrics.activeProductUnits },
      ];
  }

  // Overview tab only: Cancelled / Active customers / Active product units
  // read as a compact secondary row rather than full-size StatTiles - same
  // values/translations as before, just lighter visual weight. The other
  // (3-card) roles never produce any of these, so their secondary row is
  // simply empty/omitted below.
  const SECONDARY_PIPELINE_KEYS = new Set(["cancelledCount", "activeCustomers", "activeProducts"]);
  const primaryPipelineCards = pipelineCards.filter((card) => !SECONDARY_PIPELINE_KEYS.has(card.key));
  const secondaryPipelineCards = pipelineCards.filter((card) => SECONDARY_PIPELINE_KEYS.has(card.key));

  const quickActions = [
    // Every role has some order-read capability (same precondition the
    // sidebar nav's own unconditional Orders link relies on), so this one
    // is never gated.
    { href: "/seller/orders" as const, label: t("ordersCard"), Icon: OrdersIcon },
    ...(canManageCatalog
      ? [
          { href: "/seller/categories" as const, label: t("categoriesCard"), Icon: CategoriesIcon },
          { href: "/seller/units" as const, label: t("unitsCard"), Icon: UnitsIcon },
          { href: "/seller/products" as const, label: t("productsCard"), Icon: ProductsIcon },
        ]
      : []),
    ...(canManageCustomers ? [{ href: "/seller/customers" as const, label: t("customersCard"), Icon: CustomersIcon }] : []),
    ...(canManagePricing ? [{ href: "/seller/price-lists" as const, label: t("priceListsCard"), Icon: PriceTagIcon }] : []),
  ];

  const hasAnalyticsFilter = Boolean(rangeInput.range || rangeInput.from || rangeInput.to);

  const overviewPanel = (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("metricsTitle")}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {primaryPipelineCards.map((card) => (
          <StatTile key={card.key} label={card.label} value={card.value} accentBorder />
        ))}
      </div>
      {secondaryPipelineCards.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {secondaryPipelineCards.map((card) => (
            <div
              key={card.key}
              className="inline-flex items-center gap-1.5 rounded-control border border-primary/20 bg-muted/60 px-3 py-1.5 text-xs"
            >
              <span className="text-muted-foreground">{card.label}</span>
              <span className="font-semibold text-foreground">{card.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const analyticsPanel = salesAnalytics && effectiveRange && (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("analyticsTitle")} · {t(RANGE_LABEL_KEYS[effectiveRange.option])}
      </h2>

      <form method="GET" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="sr-only" htmlFor="dashboard-range">
            {t("analyticsTitle")}
          </label>
          <select
            id="dashboard-range"
            name="range"
            defaultValue={rangeInput.range ?? "today"}
            className={`${inputStyles} w-auto`}
          >
            <option value="today">{t("rangeToday")}</option>
            <option value="week">{t("rangeWeek")}</option>
            <option value="month">{t("rangeMonth")}</option>
            <option value="custom">{t("rangeCustom")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="dashboard-range-from">
            {t("rangeFrom")}
          </label>
          <input
            id="dashboard-range-from"
            type="date"
            name="from"
            defaultValue={rangeInput.from ?? ""}
            className={`${inputStyles} w-auto`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="dashboard-range-to">
            {t("rangeTo")}
          </label>
          <input
            id="dashboard-range-to"
            type="date"
            name="to"
            defaultValue={rangeInput.to ?? ""}
            className={`${inputStyles} w-auto`}
          />
        </div>
        <Button type="submit">{t("rangeApply")}</Button>
      </form>

      {dateRangeResult && !dateRangeResult.ok && <Alert tone="warning">{t("rangeInvalid")}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile label={t("orderValueLabel")} value={salesAnalytics.submittedOrderValue.toFixed(2)} accentBorder />
        <StatTile label={t("orderCountLabel")} value={salesAnalytics.orderCount} accentBorder />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("topProductsTitle")}</h3>
        {salesAnalytics.topProducts.length === 0 ? (
          <p className="rounded-control border border-dashed border-border p-8 text-center text-muted-foreground">
            {t("topProductsEmpty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-control border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium text-foreground">
                    {t("topProductsColumnProduct")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium text-foreground">
                    {t("topProductsColumnPackaging")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium text-foreground">
                    {t("topProductsColumnQty")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {salesAnalytics.topProducts.map((product) => (
                  <tr key={`${product.sku}-${product.unitLabel}`} className="border-t border-border">
                    <td className="px-4 py-2">
                      {product.name} <span className="text-muted-foreground">({product.sku})</span>
                    </td>
                    <td className="px-4 py-2">{product.unitLabel}</td>
                    <td className="px-4 py-2">{product.requestedQty.toLocaleString(locale, { maximumFractionDigits: 3 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const recentOrdersPanel = (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("recentActivityTitle")}</h2>
      {recentOrders.length === 0 ? (
        <p className="rounded-control border border-dashed border-border p-8 text-center text-muted-foreground">
          {t("recentActivityEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-control border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {tOrders("columnNumber")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {tOrders("columnCustomer")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {tOrders("columnDate")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {tOrders("columnStatus")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  <span className="sr-only">{tOrders("viewDetail")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id} className="border-t border-border">
                  <td className="px-4 py-2">{order.orderNumber}</td>
                  <td className="px-4 py-2">{order.customerName}</td>
                  <td className="px-4 py-2">{order.createdAt.toLocaleDateString(locale)}</td>
                  <td className="px-4 py-2">
                    <OrderStatusBadge status={order.status} label={tStatus(order.status)} />
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/seller/orders/${order.id}`} className="text-sm font-medium text-primary underline-offset-2 hover:underline">
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
  );

  const tabItems: TabItem[] = [
    { id: "overview", label: t("tabOverview"), content: overviewPanel },
    ...(analyticsPanel ? [{ id: "analytics", label: t("tabAnalytics"), content: analyticsPanel }] : []),
    { id: "recent-orders", label: t("tabRecentOrders"), content: recentOrdersPanel },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("intro")} />

      {quickActions.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("quickLinksTitle")}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {quickActions.map(({ href, label, Icon }) => (
              <Link key={href} href={href}>
                <Card
                  accentBorder
                  className="flex flex-col items-center gap-1.5 p-3 text-center transition-colors hover:bg-muted"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium text-foreground">{label}</span>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <Tabs items={tabItems} ariaLabel={t("tabsLabel")} defaultTabId={hasAnalyticsFilter ? "analytics" : "overview"} />
    </div>
  );
}
