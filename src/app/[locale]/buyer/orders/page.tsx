import { getLocale, getTranslations } from "next-intl/server";
import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { listOrdersForCustomer } from "@/lib/domain/orders/order-service";
import { computeOrderTotals, type OrderLineForTotals } from "@/lib/domain/orders/order-totals";
import { Link } from "@/i18n/navigation";

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

export default async function BuyerOrdersPage() {
  const session = await requireBuyerSession();
  const t = await getTranslations("buyer.orders");
  const locale = await getLocale();
  const orders = await listOrdersForCustomer(session.tenantId, session.customerId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

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
                    <td className="px-4 py-2">{date.toLocaleDateString(locale)}</td>
                    <td className="px-4 py-2">{t(`status.${order.status}`)}</td>
                    <td className="px-4 py-2">{totals.total.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <Link href={`/buyer/orders/${order.id}`} className="text-sm underline underline-offset-2">
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
    </div>
  );
}
