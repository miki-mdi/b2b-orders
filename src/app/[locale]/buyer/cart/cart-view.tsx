"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/lib/cart/use-cart";
import { round2 } from "@/lib/domain/orders/order-totals";
import type { ResolvedCartLine } from "@/lib/domain/orders/cart-resolution";
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
    return <p className="text-sm text-zinc-500">{t("loadingPrices")}</p>;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="w-full rounded border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
          {t("empty")}
        </p>
        <Link href="/buyer/catalog" className="text-sm underline underline-offset-2">
          {t("browseCatalog")}
        </Link>
      </div>
    );
  }

  const okLines = lines.filter((line): line is Extract<ResolvedCartLine, { ok: true }> => line.ok);
  const hasIssues = lines.some((line) => !line.ok);
  const subtotal = round2(okLines.reduce((sum, line) => sum + line.lineSubtotal, 0));
  const vat = round2(okLines.reduce((sum, line) => sum + line.lineVat, 0));
  const total = round2(subtotal + vat);
  const canCheckout = !hasIssues && okLines.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {isPending && <p className="text-xs text-zinc-500">{t("loadingPrices")}</p>}

      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">
                {t("columnProduct")}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {t("columnQuantity")}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {t("columnUnitPrice")}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {t("columnLineTotal")}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                <span className="sr-only">{t("remove")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.productUnitId} className="border-t border-zinc-200 dark:border-zinc-800">
                {line.ok ? (
                  <>
                    <td className="px-4 py-2">
                      <div>{locale === "mk" ? line.productNameMk : line.productNameEn}</div>
                      <div className="text-xs text-zinc-500">{line.unitLabel}</div>
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
                        className="w-20 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700"
                      />
                    </td>
                    <td className="px-4 py-2">
                      {line.unitPrice.toFixed(2)} {line.currency}
                    </td>
                    <td className="px-4 py-2">
                      {line.lineTotal.toFixed(2)} {line.currency}
                    </td>
                  </>
                ) : (
                  <td colSpan={3} className="px-4 py-2 text-red-600 dark:text-red-400">
                    {t(`issue.${line.issue}`)}
                  </td>
                )}
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => removeItem(line.productUnitId)}
                    className="text-sm underline underline-offset-2"
                  >
                    {t("remove")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col items-end gap-1 text-sm">
        <div className="flex w-full max-w-xs justify-between sm:w-64">
          <span>{t("subtotal")}</span>
          <span>{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex w-full max-w-xs justify-between sm:w-64">
          <span>{t("vat")}</span>
          <span>{vat.toFixed(2)}</span>
        </div>
        <div className="flex w-full max-w-xs justify-between font-semibold sm:w-64">
          <span>{t("total")}</span>
          <span>{total.toFixed(2)}</span>
        </div>
      </div>

      <div>
        {canCheckout ? (
          <Link
            href="/buyer/checkout"
            className="inline-block rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            {t("checkout")}
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-block cursor-not-allowed rounded bg-zinc-400 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-600"
          >
            {t("checkout")}
          </span>
        )}
      </div>
    </div>
  );
}
