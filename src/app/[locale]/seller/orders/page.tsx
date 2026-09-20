import type { OrderStatus } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { hasCapability, orderReadStatusScopeFor } from "@/lib/auth/permissions";
import { listOrdersForTenantPage } from "@/lib/domain/orders/order-service";
import { computeOrderTotals, type OrderLineForTotals } from "@/lib/domain/orders/order-totals";
import { clampPage } from "@/lib/pagination";
import { Link } from "@/i18n/navigation";
import { OrderStatusBadge } from "@/components/seller/order-status-badge";
import { Pagination } from "@/components/seller/pagination";

const FILTERABLE_STATUSES: OrderStatus[] = [
  "SUBMITTED",
  "CONFIRMED",
  "PICKING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

function toLineInputs(
  lines: {
    requestedQty: unknown;
    confirmedQty: unknown;
    unitPriceAtOrderTime: unknown;
    discountPercentAtOrderTime: unknown;
    vatRateAtOrderTime: unknown;
  }[]
): OrderLineForTotals[] {
  return lines.map((line) => ({
    requestedQty: Number(line.requestedQty),
    confirmedQty: line.confirmedQty ? Number(line.confirmedQty) : null,
    unitPriceAtOrderTime: Number(line.unitPriceAtOrderTime),
    discountPercentAtOrderTime: line.discountPercentAtOrderTime ? Number(line.discountPercentAtOrderTime) : null,
    vatRateAtOrderTime: Number(line.vatRateAtOrderTime),
  }));
}

export default async function SellerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const session = await requireSellerSession();
  const statusScope = orderReadStatusScopeFor(session.role);
  const canCreate = hasCapability(session.role, "orders:create");
  const { status, q, page: pageParam } = await searchParams;
  const t = await getTranslations("seller.orders");
  const tStatus = await getTranslations("seller.orders.status");
  const tCommon = await getTranslations("seller.common");

  const filterableStatuses = statusScope
    ? FILTERABLE_STATUSES.filter((s) => statusScope.includes(s))
    : FILTERABLE_STATUSES;
  const statusFilter = filterableStatuses.includes(status as OrderStatus) ? (status as OrderStatus) : undefined;
  const page = clampPage(pageParam);
  const result = await listOrdersForTenantPage(session.tenantId, {
    status: statusFilter,
    search: q || undefined,
    page,
    statusIn: statusScope,
  });
  const orders = result.items;

  function buildHref(targetPage: number): string {
    const query = new URLSearchParams();
    if (statusFilter) query.set("status", statusFilter);
    if (q) query.set("q", q);
    if (targetPage > 1) query.set("page", String(targetPage));
    const qs = query.toString();
    return qs ? `/seller/orders?${qs}` : "/seller/orders";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {canCreate && (
          <Link
            href="/seller/orders/new"
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            {t("newOrder")}
          </Link>
        )}
      </div>

      <form method="GET" className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="orders-search">
          {t("searchPlaceholder")}
        </label>
        <input
          id="orders-search"
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder={t("searchPlaceholder")}
          className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        />
        <label className="sr-only" htmlFor="orders-status">
          {t("filterStatusAll")}
        </label>
        <select
          id="orders-status"
          name="status"
          defaultValue={statusFilter ?? ""}
          className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          <option value="">{t("filterStatusAll")}</option>
          {filterableStatuses.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          {t("search")}
        </button>
      </form>

      {orders.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnNumber")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnCustomer")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnDate")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnStatus")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnTotal")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  <span className="sr-only">{t("viewDetail")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const totals = computeOrderTotals(toLineInputs(order.lines));
                const date = order.submittedAt ?? order.createdAt;
                return (
                  <tr key={order.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-4 py-2">{order.orderNumber}</td>
                    <td className="px-4 py-2">{order.customer.name}</td>
                    <td className="px-4 py-2">{date.toLocaleDateString()}</td>
                    <td className="px-4 py-2">
                      <OrderStatusBadge status={order.status} label={tStatus(order.status)} />
                    </td>
                    <td className="px-4 py-2">{totals.total.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <Link href={`/seller/orders/${order.id}`} className="text-sm underline underline-offset-2">
                        {t("viewDetail")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        buildHref={buildHref}
        previousLabel={tCommon("previous")}
        nextLabel={tCommon("next")}
        summaryLabel={tCommon("pageSummary", { page: result.page, totalPages: result.totalPages, total: result.total })}
      />
    </div>
  );
}
