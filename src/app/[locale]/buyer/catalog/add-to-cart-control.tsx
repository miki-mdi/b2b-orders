"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useCart } from "@/lib/cart/use-cart";

export function AddToCartControl({
  productUnitId,
  minOrderQty,
  orderIncrement,
}: {
  productUnitId: string;
  minOrderQty: number;
  orderIncrement: number;
}) {
  const t = useTranslations("buyer.catalog");
  const { addItem } = useCart();
  const [qty, setQty] = useState(minOrderQty);
  const [added, setAdded] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`qty-${productUnitId}`}>
        {t("quantityLabel")}
      </label>
      <input
        id={`qty-${productUnitId}`}
        type="number"
        min={minOrderQty}
        step={orderIncrement}
        value={qty}
        onChange={(event) => {
          setQty(Number(event.target.value));
          setAdded(false);
        }}
        className="w-20 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700"
      />
      <button
        type="button"
        onClick={() => {
          if (!Number.isFinite(qty) || qty <= 0) return;
          addItem(productUnitId, qty);
          setAdded(true);
        }}
        className="flex-1 rounded bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        {added ? t("added") : t("addToCart")}
      </button>
    </div>
  );
}
