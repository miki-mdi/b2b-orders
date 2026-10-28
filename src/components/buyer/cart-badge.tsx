"use client";

import { useCart } from "@/lib/cart/use-cart";

/**
 * Small item-count badge next to the "Cart" nav link - client-only since the
 * cart lives in localStorage. Uses --danger (not --primary) deliberately:
 * this badge sits inside a nav link that itself turns solid --primary when
 * Cart is the active page, so a --primary badge would disappear into that
 * background; --danger stays legible against both the plain and active
 * link states, and a red count badge is the conventional cart-icon pattern.
 */
export function CartBadge() {
  const { items, hydrated } = useCart();
  if (!hydrated || items.length === 0) return null;

  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <span className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-xs font-medium text-danger-foreground">
      {count % 1 === 0 ? count : count.toFixed(1)}
    </span>
  );
}
