import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { hasCapability, orderReadStatusScopeFor } from "@/lib/auth/permissions";
import { getOrderForTenant } from "@/lib/domain/orders/order-service";
import { listOrderActivity } from "@/lib/domain/orders/order-activity-service";
import {
  computeLineFulfillment,
  computeLineTotals,
  computeOrderTotals,
  computeSubmittedOrderTotals,
  type OrderLineForTotals,
} from "@/lib/domain/orders/order-totals";
import { Link } from "@/i18n/navigation";
import { OrderStatusBadge } from "@/components/seller/order-status-badge";
import { OrderActivityTimeline } from "@/components/seller/order-activity-timeline";
import { ConfirmOrderForm } from "./confirm-order-form";
import { AdvanceStatusForm } from "./advance-status-form";
import { markDeliveredAction, markOutForDeliveryAction, markPickingAction, markReadyAction } from "./actions";

type AddressSnapshot = {
  recipientName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postalCode: string | null;
  country: string;
};

export default async function SellerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSellerSession();
  const t = await getTranslations("seller.orders");
  const tStatus = await getTranslations("seller.orders.status");
  const tCommon = await getTranslations("seller.common");
  const locale = await getLocale();

  const order = await getOrderForTenant(session.tenantId, id, orderReadStatusScopeFor(session.role));
  if (!order) {
    notFound();
  }
  const canConfirm = hasCapability(session.role, "orders:confirm");
  const canAdvancePicking = hasCapability(session.role, "orders:advance:PICKING");
  const canAdvanceReady = hasCapability(session.role, "orders:advance:READY");
  const canAdvanceOutForDelivery = hasCapability(session.role, "orders:advance:OUT_FOR_DELIVERY");
  const canAdvanceDelivered = hasCapability(session.role, "orders:advance:DELIVERED");
  const activity = await listOrderActivity(session.tenantId, id);
  const tActivity = await getTranslations("seller.orders.activity");

  const lineInputs: OrderLineForTotals[] = order.lines.map((line) => ({
    requestedQty: Number(line.requestedQty),
    confirmedQty: line.confirmedQty ? Number(line.confirmedQty) : null,
    unitPriceAtOrderTime: Number(line.unitPriceAtOrderTime),
    discountPercentAtOrderTime: line.discountPercentAtOrderTime ? Number(line.discountPercentAtOrderTime) : null,
    vatRateAtOrderTime: Number(line.vatRateAtOrderTime),
  }));
  const submittedTotals = computeSubmittedOrderTotals(lineInputs);
  const confirmedTotals = computeOrderTotals(lineInputs);
  const hasConfirmedQuantities = order.lines.some((line) => line.confirmedQty !== null);
  const addressSnapshot = order.deliveryAddressSnapshot as AddressSnapshot | null;
  const submittedDate = order.submittedAt ?? order.createdAt;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/seller/orders" className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("detailTitle", { number: order.orderNumber })}</h1>
        <p className="text-sm text-zinc-500">{t("submittedAt", { date: submittedDate.toLocaleString(locale) })}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <OrderStatusBadge status={order.status} label={tStatus(order.status)} />
        <span className="text-sm text-zinc-500">
          {t("placedBy", { name: order.placedByName, role: order.placedByRole })}
        </span>
      </div>

      {order.status === "CANCELLED" && (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {t("cancelledInfo")}
          {order.cancelReason ? ` ${order.cancelReason}` : ""}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm">
          <h2 className="font-semibold">{t("customer")}</h2>
          <p className="text-zinc-600 dark:text-zinc-400">{order.customer.name}</p>
        </div>
        {order.requestedDeliveryDate && (
          <div className="flex flex-col gap-1 text-sm">
            <h2 className="font-semibold">{t("requestedDeliveryDate")}</h2>
            <p className="text-zinc-600 dark:text-zinc-400">{order.requestedDeliveryDate.toLocaleDateString(locale)}</p>
          </div>
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
      </div>

      {order.status === "SUBMITTED" && canConfirm && (
        <ConfirmOrderForm
          orderId={order.id}
          lines={order.lines.map((line) => ({
            id: line.id,
            productNameSnapshot: line.productNameSnapshot,
            productSkuSnapshot: line.productSkuSnapshot,
            unitLabelSnapshot: line.unitLabelSnapshot,
            requestedQty: Number(line.requestedQty),
          }))}
        />
      )}
      {order.status === "CONFIRMED" && canAdvancePicking && (
        <AdvanceStatusForm action={markPickingAction.bind(null, order.id)} label={t("markPicking")} />
      )}
      {order.status === "PICKING" && canAdvanceReady && (
        <AdvanceStatusForm action={markReadyAction.bind(null, order.id)} label={t("markReady")} />
      )}
      {order.status === "READY" && canAdvanceOutForDelivery && (
        <AdvanceStatusForm action={markOutForDeliveryAction.bind(null, order.id)} label={t("markOutForDelivery")} />
      )}
      {order.status === "OUT_FOR_DELIVERY" && canAdvanceDelivered && (
        <AdvanceStatusForm
          action={markDeliveredAction.bind(null, order.id)}
          label={t("markDelivered")}
          confirmMessage={t("markDelivered")}
        />
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
                  {t("columnRequestedQty")}
                </th>
                {hasConfirmedQuantities && (
                  <>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t("columnConfirmedQty")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t("columnUnavailableQty")}
                    </th>
                  </>
                )}
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
                const fulfillment = computeLineFulfillment(lineInputs[index]);
                const totals = computeLineTotals(lineInputs[index]);
                return (
                  <tr key={line.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-4 py-2">{line.productNameSnapshot}</td>
                    <td className="px-4 py-2">{line.productSkuSnapshot}</td>
                    <td className="px-4 py-2">{line.unitLabelSnapshot}</td>
                    <td className="px-4 py-2">{fulfillment.requestedQty}</td>
                    {hasConfirmedQuantities && (
                      <>
                        <td className="px-4 py-2">{fulfillment.confirmedQty ?? "-"}</td>
                        <td className="px-4 py-2">{fulfillment.unavailableQty || "-"}</td>
                      </>
                    )}
                    <td className="px-4 py-2">{totals.netUnitPrice.toFixed(2)}</td>
                    <td className="px-4 py-2">{totals.total.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-6 sm:flex-row sm:justify-end">
        <div className="flex flex-col items-end gap-1 text-sm">
          <h3 className="font-medium">{t("submittedTotals")}</h3>
          <div className="flex w-64 justify-between">
            <span>{t("subtotal")}</span>
            <span>{submittedTotals.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex w-64 justify-between">
            <span>{t("vat")}</span>
            <span>{submittedTotals.vat.toFixed(2)}</span>
          </div>
          <div className="flex w-64 justify-between font-semibold">
            <span>{t("total")}</span>
            <span>{submittedTotals.total.toFixed(2)}</span>
          </div>
        </div>
        {hasConfirmedQuantities && (
          <div className="flex flex-col items-end gap-1 text-sm">
            <h3 className="font-medium">{t("confirmedTotals")}</h3>
            <div className="flex w-64 justify-between">
              <span>{t("subtotal")}</span>
              <span>{confirmedTotals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex w-64 justify-between">
              <span>{t("vat")}</span>
              <span>{confirmedTotals.vat.toFixed(2)}</span>
            </div>
            <div className="flex w-64 justify-between font-semibold">
              <span>{t("total")}</span>
              <span>{confirmedTotals.total.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      <OrderActivityTimeline
        items={activity}
        title={tActivity("title")}
        empty={tActivity("empty")}
        locale={locale}
        translateStatus={(status) => tStatus(status)}
        labels={{
          orderCreated: tActivity("orderCreated"),
          statusChanged: (oldLabel, newLabel) => tActivity("statusChanged", { old: oldLabel, new: newLabel }),
          quantityAdjusted: (product, oldQty, newQty) => tActivity("quantityAdjusted", { product, old: oldQty, new: newQty }),
          generic: (action, entity) => tActivity("generic", { action, entity }),
          reasonLabel: (reason) => tActivity("reasonLabel", { reason }),
          actorSystem: tActivity("actorSystem"),
        }}
      />
    </div>
  );
}
