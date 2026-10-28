import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { getOrderForCustomer } from "@/lib/domain/orders/order-service";
import { computeLineTotals, computeOrderTotals, type OrderLineForTotals } from "@/lib/domain/orders/order-totals";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
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
  const hasAddressCard = Boolean(addressSnapshot || order.note);
  const submittedDate = order.submittedAt ?? order.createdAt;

  return (
    <div className="flex flex-col gap-6">
      {submitted === "1" && <ClearCartOnMount />}

      <div className="flex flex-col items-start gap-2">
        <Link href="/buyer/orders" className={buttonStyles("ghost")}>
          {tCommon("backToList")}
        </Link>
        <PageHeader
          title={t("detailTitle", { number: order.orderNumber })}
          subtitle={t("submittedAt", { date: submittedDate.toLocaleString(locale) })}
        />
      </div>

      {submitted === "1" && <Alert tone="success">{t("submittedBanner")}</Alert>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {hasAddressCard && (
          <Card accentBorder className="flex flex-col gap-4 p-4">
            {addressSnapshot && (
              <div className="flex flex-col gap-1 text-sm">
                <h2 className="font-semibold text-foreground">{t("deliveryAddress")}</h2>
                <p className="text-muted-foreground">
                  {addressSnapshot.recipientName}, {addressSnapshot.addressLine1}
                  {addressSnapshot.addressLine2 ? `, ${addressSnapshot.addressLine2}` : ""}, {addressSnapshot.city}
                  {addressSnapshot.postalCode ? ` ${addressSnapshot.postalCode}` : ""}, {addressSnapshot.country}
                </p>
              </div>
            )}

            {order.note && (
              <div className="flex flex-col gap-1 text-sm">
                <h2 className="font-semibold text-foreground">{t("note")}</h2>
                <p className="text-muted-foreground">{order.note}</p>
              </div>
            )}
          </Card>
        )}

        <Card accentBorder className={`flex flex-col gap-3 p-4 ${hasAddressCard ? "" : "lg:col-span-2"}`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-block rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground">
              {t(`status.${order.status}`)}
            </span>
            {order.cutOffWarningShown && <span className="text-xs text-warning">{t("cutOffWasShown")}</span>}
          </div>

          {order.placedByRole !== "BUYER_ADMIN" && order.placedByRole !== "BUYER_EMPLOYEE" && (
            <p className="text-sm text-muted-foreground">
              {t("placedBy", { name: order.placedByName, role: order.placedByRole })}
            </p>
          )}

          {order.status === "SUBMITTED" && <CancelOrderForm orderId={order.id} />}
          {order.status === "CANCELLED" && order.cancelReason && (
            <p className="text-sm text-muted-foreground">
              {t("cancelReasonLabel")}: {order.cancelReason}
            </p>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground">{t("lines")}</h2>
        <Card accentBorder className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnProduct")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnSku")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnUnit")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnQty")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnUnitPrice")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnLineTotal")}
                </th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line, index) => {
                const lineTotals = computeLineTotals(lineInputs[index]);
                return (
                  <tr key={line.id} className="border-t border-border">
                    <td className="px-4 py-2 text-foreground">{line.productNameSnapshot}</td>
                    <td className="px-4 py-2 text-foreground">{line.productSkuSnapshot}</td>
                    <td className="px-4 py-2 text-foreground">{line.unitLabelSnapshot}</td>
                    <td className="px-4 py-2 text-foreground">{Number(line.requestedQty)}</td>
                    <td className="px-4 py-2 text-foreground">{lineTotals.netUnitPrice.toFixed(2)}</td>
                    <td className="px-4 py-2 font-medium text-foreground">{lineTotals.total.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      <Card accentBorder className="ml-auto flex w-full flex-col gap-1.5 p-4 text-sm sm:w-64">
        <div className="flex justify-between text-muted-foreground">
          <span>{t("subtotal")}</span>
          <span>{totals.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>{t("vat")}</span>
          <span>{totals.vat.toFixed(2)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold text-foreground">
          <span>{t("total")}</span>
          <span>{totals.total.toFixed(2)}</span>
        </div>
      </Card>
    </div>
  );
}
