import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { getOrderForCustomer } from "@/lib/domain/orders/order-service";
import { computeLineTotals, computeOrderTotals, type OrderLineForTotals } from "@/lib/domain/orders/order-totals";
import { Link } from "@/i18n/navigation";
import { ClearCartOnMount } from "./clear-cart-on-mount";
import { CancelOrderForm } from "./cancel-order-form";

type AddressSnapshot = {
  recipientName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postalCode: string | null;
  country: string;
};

export default async function BuyerOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { id } = await params;
  const { submitted } = await searchParams;
  const session = await requireBuyerSession();
  const t = await getTranslations("buyer.orders");
  const tCommon = await getTranslations("buyer.common");
  const locale = await getLocale();

  const order = await getOrderForCustomer(session.tenantId, session.customerId, id);
  if (!order) {
    notFound();
  }

  const lineInputs: OrderLineForTotals[] = order.lines.map((line) => ({
    requestedQty: Number(line.requestedQty),
    confirmedQty: line.confirmedQty ? Number(line.confirmedQty) : null,
    unitPriceAtOrderTime: Number(line.unitPriceAtOrderTime),
    discountPercentAtOrderTime: line.discountPercentAtOrderTime ? Number(line.discountPercentAtOrderTime) : null,
    vatRateAtOrderTime: Number(line.vatRateAtOrderTime),
  }));
  const totals = computeOrderTotals(lineInputs);
  const addressSnapshot = order.deliveryAddressSnapshot as AddressSnapshot | null;
  const submittedDate = order.submittedAt ?? order.createdAt;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {submitted === "1" && <ClearCartOnMount />}

      <div className="flex flex-col gap-1">
        <Link href="/buyer/orders" className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("detailTitle", { number: order.orderNumber })}</h1>
        <p className="text-sm text-zinc-500">{t("submittedAt", { date: submittedDate.toLocaleString(locale) })}</p>
      </div>

      {submitted === "1" && (
        <p
          role="status"
          className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          {t("submittedBanner")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-block rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium dark:bg-zinc-800">
          {t(`status.${order.status}`)}
        </span>
        {order.cutOffWarningShown && (
          <span className="text-xs text-amber-700 dark:text-amber-300">{t("cutOffWasShown")}</span>
        )}
      </div>

      {order.placedByRole !== "BUYER_ADMIN" && order.placedByRole !== "BUYER_EMPLOYEE" && (
        <p className="text-sm text-zinc-500">{t("placedBy", { name: order.placedByName, role: order.placedByRole })}</p>
      )}

      {order.status === "SUBMITTED" && <CancelOrderForm orderId={order.id} />}
      {order.status === "CANCELLED" && order.cancelReason && (
        <p className="text-sm text-zinc-500">
          {t("cancelReasonLabel")}: {order.cancelReason}
        </p>
      )}

      {addressSnapshot && (
        <div className="flex flex-col gap-1 text-sm">
          <h2 className="font-semibold">{t("deliveryAddress")}</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            {addressSnapshot.recipientName}, {addressSnapshot.addressLine1}
            {addressSnapshot.addressLine2 ? `, ${addressSnapshot.addressLine2}` : ""}, {addressSnapshot.city}
            {addressSnapshot.postalCode ? ` ${addressSnapshot.postalCode}` : ""}, {addressSnapshot.country}
          </p>
        </div>
      )}

      {order.note && (
        <div className="flex flex-col gap-1 text-sm">
          <h2 className="font-semibold">{t("note")}</h2>
          <p className="text-zinc-600 dark:text-zinc-400">{order.note}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">{t("lines")}</h2>
        <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnProduct")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnSku")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnUnit")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnQty")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnUnitPrice")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnLineTotal")}
                </th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line, index) => {
                const lineTotals = computeLineTotals(lineInputs[index]);
                return (
                  <tr key={line.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-4 py-2">{line.productNameSnapshot}</td>
                    <td className="px-4 py-2">{line.productSkuSnapshot}</td>
                    <td className="px-4 py-2">{line.unitLabelSnapshot}</td>
                    <td className="px-4 py-2">{Number(line.requestedQty)}</td>
                    <td className="px-4 py-2">{lineTotals.netUnitPrice.toFixed(2)}</td>
                    <td className="px-4 py-2">{lineTotals.total.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 text-sm">
        <div className="flex w-full max-w-xs justify-between sm:w-64">
          <span>{t("subtotal")}</span>
          <span>{totals.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex w-full max-w-xs justify-between sm:w-64">
          <span>{t("vat")}</span>
          <span>{totals.vat.toFixed(2)}</span>
        </div>
        <div className="flex w-full max-w-xs justify-between font-semibold sm:w-64">
          <span>{t("total")}</span>
          <span>{totals.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
