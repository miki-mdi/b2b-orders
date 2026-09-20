"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useCart } from "@/lib/cart/use-cart";
import { round2 } from "@/lib/domain/orders/order-totals";
import { isPastCutOffForDelivery } from "@/lib/domain/orders/cutoff";
import type { ResolvedCartLine } from "@/lib/domain/orders/cart-resolution";
import { FieldError } from "@/components/forms/field-error";
import { initialFormState } from "@/lib/forms/form-state";
import { resolveCartAction } from "../cart/actions";
import { submitOrderAction } from "./actions";

export type AddressOption = {
  id: string;
  label: string;
  recipientName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  isDefaultDelivery: boolean;
};

export function CheckoutForm({ addresses, cutOffTime }: { addresses: AddressOption[]; cutOffTime: string | null }) {
  const t = useTranslations("buyer.checkout");
  const tCommon = useTranslations("buyer.common");
  const locale = useLocale();
  const { items, hydrated } = useCart();
  const [resolvedLines, setResolvedLines] = useState<ResolvedCartLine[] | null>(null);
  const [, startTransition] = useTransition();
  const [deliveryDate, setDeliveryDate] = useState("");
  const [state, formAction, pending] = useActionState(submitOrderAction, initialFormState);

  useEffect(() => {
    if (!hydrated || items.length === 0) return;
    startTransition(() => {
      resolveCartAction(items).then((result) => setResolvedLines(result.lines));
    });
  }, [hydrated, items]);

  // See cart-view.tsx's identical comment: derived, not stored, so the
  // empty-cart branch never needs a synchronous setState in the effect above.
  const lines = items.length === 0 ? [] : resolvedLines;

  const okLines = (lines ?? []).filter((line): line is Extract<ResolvedCartLine, { ok: true }> => line.ok);
  const hasIssues = (lines ?? []).some((line) => !line.ok);
  const subtotal = round2(okLines.reduce((sum, line) => sum + line.lineSubtotal, 0));
  const vat = round2(okLines.reduce((sum, line) => sum + line.lineVat, 0));
  const total = round2(subtotal + vat);

  const showCutOffWarning = useMemo(() => {
    if (!deliveryDate) return false;
    const parsed = new Date(`${deliveryDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;
    return isPastCutOffForDelivery({ cutOffTime }, parsed);
  }, [deliveryDate, cutOffTime]);

  const defaultAddress = addresses.find((address) => address.isDefaultDelivery) ?? addresses[0];
  const today = new Date().toISOString().slice(0, 10);

  if (!hydrated) {
    return <p className="text-sm text-zinc-500">{tCommon("loading")}</p>;
  }
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{t("emptyCart")}</p>;
  }
  if (addresses.length === 0) {
    return <p className="text-sm text-red-600 dark:text-red-400">{t("noAddresses")}</p>;
  }
  if (lines === null) {
    return <p className="text-sm text-zinc-500">{tCommon("loading")}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="cartJson" value={JSON.stringify(items)} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t("deliveryAddress")}</legend>
        {addresses.map((address) => (
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
        ))}
        <FieldError message={state.fieldErrors?.deliveryAddressId} />
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        {t("deliveryDate")}
        <input
          type="date"
          name="requestedDeliveryDate"
          min={today}
          value={deliveryDate}
          onChange={(event) => setDeliveryDate(event.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.requestedDeliveryDate} />
      </label>

      {showCutOffWarning && (
        <p
          role="alert"
          className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          {t("cutOffWarning", { time: cutOffTime ?? "" })}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm">
        {t("note")}
        <textarea
          name="note"
          rows={3}
          placeholder={t("notePlaceholder")}
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
      </label>

      <div className="rounded border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <h2 className="mb-2 font-semibold">{t("summary")}</h2>
        <ul className="mb-3 flex flex-col gap-1">
          {lines.map((line) =>
            line.ok ? (
              <li key={line.productUnitId} className="flex justify-between gap-4">
                <span>
                  {locale === "mk" ? line.productNameMk : line.productNameEn} × {line.requestedQty}
                </span>
                <span>
                  {line.lineTotal.toFixed(2)} {line.currency}
                </span>
              </li>
            ) : (
              <li key={line.productUnitId} className="text-red-600 dark:text-red-400">
                {line.productUnitId}
              </li>
            )
          )}
        </ul>
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

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || hasIssues}
        aria-busy={pending}
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {pending ? "…" : t("submit")}
      </button>
    </form>
  );
}
