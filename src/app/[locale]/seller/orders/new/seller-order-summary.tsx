"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSellerBasket } from "./seller-basket-context";
import { round2 } from "@/lib/domain/orders/order-totals";
import type { ResolvedCartLine } from "@/lib/domain/orders/cart-resolution";
import { FieldError } from "@/components/forms/field-error";
import { initialFormState } from "@/lib/forms/form-state";
import { resolveSellerOrderLinesAction, createSellerOrderAction } from "./actions";

export type SellerAddressOption = {
  id: string;
  label: string;
  recipientName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  isDefaultDelivery: boolean;
};

export function SellerOrderSummary({
  customerId,
  addresses,
}: {
  customerId: string;
  addresses: SellerAddressOption[];
}) {
  const t = useTranslations("seller.orders");
  // The underlying issue codes (NOT_FOUND, BELOW_MIN_QTY, ...) come from the
  // exact same CartLineIssue union the buyer flow uses (resolveCartLine is
  // shared) - reusing its translations here instead of duplicating them.
  const tCartIssue = useTranslations("buyer.cart");
  const locale = useLocale();
  const { items, removeItem } = useSellerBasket();
  const [resolvedLines, setResolvedLines] = useState<ResolvedCartLine[] | null>(null);
  const [, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState(createSellerOrderAction, initialFormState);

  useEffect(() => {
    if (items.length === 0) return;
    startTransition(() => {
      resolveSellerOrderLinesAction(customerId, items).then((result) => setResolvedLines(result.lines));
    });
  }, [items, customerId]);

  const lines = items.length === 0 ? [] : resolvedLines;
  const okLines = (lines ?? []).filter((line): line is Extract<ResolvedCartLine, { ok: true }> => line.ok);
  const hasIssues = (lines ?? []).some((line) => !line.ok);
  const subtotal = round2(okLines.reduce((sum, line) => sum + line.lineSubtotal, 0));
  const vat = round2(okLines.reduce((sum, line) => sum + line.lineVat, 0));
  const total = round2(subtotal + vat);
  const defaultAddress = addresses.find((address) => address.isDefaultDelivery) ?? addresses[0];
  const today = new Date().toISOString().slice(0, 10);

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{t("basketEmpty")}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded border border-zinc-200 p-4 dark:border-zinc-800">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="basketJson" value={JSON.stringify(items)} />

      <div>
        <h2 className="text-lg font-semibold">{t("summary")}</h2>
        {lines === null && <p className="text-sm text-zinc-500">{t("loadingPrices")}</p>}
      </div>

      {lines !== null && lines.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {lines.map((line) =>
            line.ok ? (
              <li key={line.productUnitId} className="flex items-center justify-between gap-2">
                <span>
                  {locale === "mk" ? line.productNameMk : line.productNameEn} × {line.requestedQty}
                </span>
                <span className="flex items-center gap-2">
                  {line.lineTotal.toFixed(2)}
                  <button
                    type="button"
                    onClick={() => removeItem(line.productUnitId)}
                    className="text-xs underline underline-offset-2"
                  >
                    ×
                  </button>
                </span>
              </li>
            ) : (
              <li key={line.productUnitId} className="flex items-center justify-between gap-2 text-red-600 dark:text-red-400">
                <span>{tCartIssue(`issue.${line.issue}`)}</span>
                <button
                  type="button"
                  onClick={() => removeItem(line.productUnitId)}
                  className="text-xs underline underline-offset-2"
                >
                  ×
                </button>
              </li>
            )
          )}
        </ul>
      )}

      <div className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <span>{t("subtotal")}</span>
          <span>{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("vat")}</span>
          <span>{vat.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>{t("total")}</span>
          <span>{total.toFixed(2)}</span>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t("deliveryAddressLabel")}</legend>
        {addresses.length === 0 ? (
          <p className="text-sm text-red-600 dark:text-red-400">{t("noAddressesWarning")}</p>
        ) : (
          addresses.map((address) => (
            <label
              key={address.id}
              className="flex items-start gap-2 rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800"
            >
              <input
                type="radio"
                name="deliveryAddressId"
                value={address.id}
                defaultChecked={defaultAddress?.id === address.id}
                className="mt-1"
                required
              />
              <span>
                <span className="block font-medium">{address.label}</span>
                <span className="block text-zinc-500">
                  {address.recipientName}, {address.addressLine1}
                  {address.addressLine2 ? `, ${address.addressLine2}` : ""}, {address.city}
                </span>
              </span>
            </label>
          ))
        )}
        <FieldError message={state.fieldErrors?.deliveryAddressId} />
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        {t("deliveryDateLabel")}
        <input
          type="date"
          name="requestedDeliveryDate"
          min={today}
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("noteLabel")}
        <textarea name="note" rows={3} className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700" />
      </label>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || hasIssues || addresses.length === 0}
        aria-busy={pending}
        className="self-start rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {pending ? "…" : t("submitOrder")}
      </button>
    </form>
  );
}
