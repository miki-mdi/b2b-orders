"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useCart } from "@/lib/cart/use-cart";
import { Button } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/form-field";

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
    <div className="flex flex-wrap items-center gap-2">
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
        className={`w-20 shrink-0 ${inputStyles}`}
      />
      <Button
        type="button"
        className="flex-1 whitespace-nowrap"
        onClick={() => {
          if (!Number.isFinite(qty) || qty <= 0) return;
          addItem(productUnitId, qty);
          setAdded(true);
        }}
      >
        {added ? t("added") : t("addToCart")}
      </Button>
    </div>
  );
}
