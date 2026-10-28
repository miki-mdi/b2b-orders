import type { OrderStatus } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { hasCapability, orderReadStatusScopeFor } from "@/lib/auth/permissions";
import { listOrdersForTenantPage, type DriverReadScope } from "@/lib/domain/orders/order-service";
import { getOwnActiveTenantMembershipId } from "@/lib/domain/orders/driver-assignment-service";
import { computeOrderTotals, type OrderLineForTotals } from "@/lib/domain/orders/order-totals";
import { clampPage } from "@/lib/pagination";
import { Link } from "@/i18n/navigation";
import { OrderStatusBadge } from "@/components/seller/order-status-badge";
import { Pagination } from "@/components/seller/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button, buttonStyles } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/form-field";

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
  // A Delivery Driver session with no resolvable active membership (should
  // not normally happen - requireSellerSession() already implies one) fails
  // closed to an empty inbox rather than falling through to an unscoped read.
  let driverScope: DriverReadScope | undefined;
  let driverHasNoMembership = false;
  if (session.role === "DELIVERY_DRIVER") {
    const membershipId = await getOwnActiveTenantMembershipId(session.tenantId, session.userId);
    if (membershipId) {
      driverScope = { membershipId };
    } else {
      driverHasNoMembership = true;
    }
  }
  const { status, q, page: pageParam } = await searchParams;
  const t = await getTranslations("seller.orders");
  const tStatus = await getTranslations("seller.orders.status");
  const tCommon = await getTranslations("seller.common");

  const filterableStatuses = statusScope
    ? FILTERABLE_STATUSES.filter((s) => statusScope.includes(s))
    : FILTERABLE_STATUSES;
  const statusFilter = filterableStatuses.includes(status as OrderStatus) ? (status as OrderStatus) : undefined;
  const page = clampPage(pageParam);
  const result = driverHasNoMembership
    ? { items: [], page: 1, pageSize: 1, total: 0, totalPages: 1 }
    : await listOrdersForTenantPage(session.tenantId, {
        status: statusFilter,
        search: q || undefined,
        page,
        statusIn: statusScope,
        driverScope,
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
      <PageHeader
        title={t("title")}
        action={
          canCreate ? (
            <Link href="/seller/orders/new" className={buttonStyles("primary")}>
              {t("newOrder")}
            </Link>
          ) : undefined
        }
      />

      <Card accentBorder className="p-3">
        <form method="GET" className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor="orders-search">
            {t("searchPlaceholder")}
          </label>
          <input
            id="orders-search"
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder={t("searchPlaceholder")}
            className={`flex-1 ${inputStyles}`}
          />
          <label className="sr-only" htmlFor="orders-status">
            {t("filterStatusAll")}
          </label>
          <select
            id="orders-status"
            name="status"
            defaultValue={statusFilter ?? ""}
            className={`${inputStyles} sm:w-auto`}
          >
            <option value="">{t("filterStatusAll")}</option>
            {filterableStatuses.map((s) => (
              <option key={s} value={s}>
                {tStatus(s)}
              </option>
            ))}
          </select>
          <Button type="submit">{t("search")}</Button>
        </form>
      </Card>

      {orders.length === 0 ? (
        <p className="rounded-control border border-dashed border-border p-8 text-center text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <Card accentBorder className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnNumber")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnCustomer")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnDate")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnStatus")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnTotal")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  <span className="sr-only">{t("viewDetail")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const totals = computeOrderTotals(toLineInputs(order.lines));
                const date = order.submittedAt ?? order.createdAt;
                return (
                  <tr key={order.id} className="border-t border-border">
                    <td className="px-4 py-2 text-foreground">{order.orderNumber}</td>
                    <td className="px-4 py-2 text-foreground">{order.customer.name}</td>
                    <td className="px-4 py-2 text-foreground">{date.toLocaleDateString()}</td>
                    <td className="px-4 py-2">
                      <OrderStatusBadge status={order.status} label={tStatus(order.status)} />
                    </td>
                    <td className="px-4 py-2 text-foreground">{totals.total.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/seller/orders/${order.id}`}
                        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {t("viewDetail")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
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
