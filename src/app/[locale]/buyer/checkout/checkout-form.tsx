"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useCart } from "@/lib/cart/use-cart";
import { round2 } from "@/lib/domain/orders/order-totals";
import { isPastCutOffForDelivery } from "@/lib/domain/orders/cutoff";
import type { ResolvedCartLine } from "@/lib/domain/orders/cart-resolution";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FormField, inputStyles } from "@/components/ui/form-field";
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
    return <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>;
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("emptyCart")}</p>;
  }
  if (addresses.length === 0) {
    return <Alert tone="danger">{t("noAddresses")}</Alert>;
  }
  if (lines === null) {
    return <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <input type="hidden" name="cartJson" value={JSON.stringify(items)} />

      <Card accentBorder className="flex flex-1 flex-col gap-4 p-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-foreground">{t("deliveryAddress")}</legend>
          {addresses.map((address) => (
            <label
              key={address.id}
              className="flex items-start gap-2 rounded-control border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
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
                <span className="block font-medium text-foreground">{address.label}</span>
                <span className="block text-muted-foreground">
                  {address.recipientName}, {address.addressLine1}
                  {address.addressLine2 ? `, ${address.addressLine2}` : ""}, {address.city}
                </span>
              </span>
            </label>
          ))}
          {state.fieldErrors?.deliveryAddressId && (
            <p role="alert" className="text-sm text-danger">
              {state.fieldErrors.deliveryAddressId}
            </p>
          )}
        </fieldset>

        <FormField label={t("deliveryDate")} htmlFor="requestedDeliveryDate" error={state.fieldErrors?.requestedDeliveryDate}>
          <input
            id="requestedDeliveryDate"
            type="date"
            name="requestedDeliveryDate"
            min={today}
            value={deliveryDate}
            onChange={(event) => setDeliveryDate(event.target.value)}
            className={inputStyles}
          />
        </FormField>

        {showCutOffWarning && <Alert tone="warning">{t("cutOffWarning", { time: cutOffTime ?? "" })}</Alert>}

        <FormField label={t("note")} htmlFor="note">
          <textarea id="note" name="note" rows={3} placeholder={t("notePlaceholder")} className={inputStyles} />
        </FormField>
      </Card>

      <Card accentBorder className="flex w-full flex-col gap-3 p-4 lg:w-80 lg:shrink-0">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("summary")}</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {lines.map((line) =>
            line.ok ? (
              <li key={line.productUnitId} className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  {locale === "mk" ? line.productNameMk : line.productNameEn} × {line.requestedQty}
                </span>
                <span className="text-foreground">
                  {line.lineTotal.toFixed(2)} {line.currency}
                </span>
              </li>
            ) : (
              <li key={line.productUnitId} className="text-xs text-danger">
                {line.productUnitId}
              </li>
            )
          )}
        </ul>
        <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>{t("subtotal")}</span>
            <span>{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{t("vat")}</span>
            <span>{vat.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold text-foreground">
            <span>{t("total")}</span>
            <span>{total.toFixed(2)}</span>
          </div>
        </div>

        {state.status === "error" && <Alert tone="danger">{state.message}</Alert>}

        <Button type="submit" disabled={pending || hasIssues} aria-busy={pending} className="w-full">
          {pending ? "…" : t("submit")}
        </Button>
      </Card>
    </form>
  );
}
