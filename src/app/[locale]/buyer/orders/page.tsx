import { getLocale, getTranslations } from "next-intl/server";
import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { listOrdersForCustomer } from "@/lib/domain/orders/order-service";
import { computeOrderTotals, type OrderLineForTotals } from "@/lib/domain/orders/order-totals";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";

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
  const tNav = await getTranslations("buyer.nav");
  const locale = await getLocale();
  const orders = await listOrdersForCustomer(session.tenantId, session.customerId);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} />

      {orders.length === 0 ? (
        <Card accentBorder className="mx-auto flex max-w-sm flex-col items-center gap-4 p-8 text-center">
          <p className="text-muted-foreground">{t("empty")}</p>
          <Link href="/buyer/catalog" className={buttonStyles("primary")}>
            {tNav("catalog")}
          </Link>
        </Card>
      ) : (
        <Card accentBorder className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnNumber")}
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
                    <td className="px-4 py-2 text-foreground">{date.toLocaleDateString(locale)}</td>
                    <td className="px-4 py-2 text-foreground">{t(`status.${order.status}`)}</td>
                    <td className="px-4 py-2 text-foreground">{totals.total.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/buyer/orders/${order.id}`}
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
    </div>
  );
}
