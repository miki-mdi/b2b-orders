"use client";

import { useCart } from "@/lib/cart/use-cart";

/** Small item-count badge next to the "Cart" nav link - client-only since the cart lives in localStorage. */
export function CartBadge() {
  const { items, hydrated } = useCart();
  if (!hydrated || items.length === 0) return null;

  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <span className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-black px-1.5 py-0.5 text-xs font-medium text-white dark:bg-white dark:text-black">
      {count % 1 === 0 ? count : count.toFixed(1)}
    </span>
  );
}
