"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/lib/cart/use-cart";
import { round2 } from "@/lib/domain/orders/order-totals";
import type { ResolvedCartLine } from "@/lib/domain/orders/cart-resolution";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/form-field";
import { resolveCartAction } from "./actions";

export function CartView() {
  const t = useTranslations("buyer.cart");
  const locale = useLocale();
  const { items, hydrated, setQuantity, removeItem } = useCart();
  const [resolvedLines, setResolvedLines] = useState<ResolvedCartLine[] | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!hydrated || items.length === 0) return;
    startTransition(() => {
      resolveCartAction(items).then((result) => setResolvedLines(result.lines));
    });
    // `items` is a new array reference on every cart mutation, which is
    // exactly when this preview should be re-resolved against the server.
  }, [hydrated, items]);

  // Derived, not stored: an empty cart never needs a server round trip, so
  // this is computed straight from `items` instead of being set from
  // inside the effect above (which would mean calling setState
  // synchronously in an effect body for that branch).
  const lines = items.length === 0 ? [] : resolvedLines;

  if (!hydrated || lines === null) {
    return <p className="text-sm text-muted-foreground">{t("loadingPrices")}</p>;
  }

  if (items.length === 0) {
    return (
      <Card accentBorder className="mx-auto flex max-w-sm flex-col items-center gap-4 p-8 text-center">
        <p className="text-muted-foreground">{t("empty")}</p>
        <Link href="/buyer/catalog" className={buttonStyles("primary")}>
          {t("browseCatalog")}
        </Link>
      </Card>
    );
  }

  const okLines = lines.filter((line): line is Extract<ResolvedCartLine, { ok: true }> => line.ok);
  const hasIssues = lines.some((line) => !line.ok);
  const subtotal = round2(okLines.reduce((sum, line) => sum + line.lineSubtotal, 0));
  const vat = round2(okLines.reduce((sum, line) => sum + line.lineVat, 0));
  const total = round2(subtotal + vat);
  const canCheckout = !hasIssues && okLines.length > 0;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-col gap-3">
        {isPending && <p className="text-xs text-muted-foreground">{t("loadingPrices")}</p>}

        <Card accentBorder className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnProduct")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnQuantity")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnUnitPrice")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnLineTotal")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  <span className="sr-only">{t("remove")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.productUnitId} className="border-t border-border">
                  {line.ok ? (
                    <>
                      <td className="px-4 py-2">
                        <div className="text-foreground">{locale === "mk" ? line.productNameMk : line.productNameEn}</div>
                        <div className="text-xs text-muted-foreground">
                          {line.unitLabel} · {line.productSku}/{line.unitSku}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <label className="sr-only" htmlFor={`qty-${line.productUnitId}`}>
                          {t("columnQuantity")}
                        </label>
                        <input
                          id={`qty-${line.productUnitId}`}
                          type="number"
                          defaultValue={line.requestedQty}
                          min={line.minOrderQty}
                          step={line.orderIncrement}
                          onBlur={(event) => setQuantity(line.productUnitId, Number(event.target.value))}
                          className={`w-20 ${inputStyles}`}
                        />
                      </td>
                      <td className="px-4 py-2 text-foreground">
                        {line.unitPrice.toFixed(2)} {line.currency}
                      </td>
                      <td className="px-4 py-2 font-medium text-foreground">
                        {line.lineTotal.toFixed(2)} {line.currency}
                      </td>
                    </>
                  ) : (
                    <td colSpan={3} className="px-4 py-2 text-danger">
                      {t(`issue.${line.issue}`)}
                    </td>
                  )}
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => removeItem(line.productUnitId)}
                      className="text-sm text-danger hover:underline"
                    >
                      {t("remove")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card accentBorder className="flex w-full flex-col gap-3 p-4 lg:w-80 lg:shrink-0">
        <div className="flex flex-col gap-1.5 text-sm">
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

        {canCheckout ? (
          <Link href="/buyer/checkout" className={buttonStyles("primary", "md", "w-full")}>
            {t("checkout")}
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-control bg-muted px-4 py-2 text-sm font-medium text-muted-foreground"
          >
            {t("checkout")}
          </span>
        )}
      </Card>
    </div>
  );
}
