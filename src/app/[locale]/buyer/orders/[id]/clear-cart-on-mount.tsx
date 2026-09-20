"use client";

import { useEffect } from "react";
import { useCart } from "@/lib/cart/use-cart";

/**
 * Rendered only once, right after a successful order submission (gated by
 * the `?submitted=1` query param set by checkout/actions.ts's redirect) -
 * clears the browser-persisted cart now that its contents have become a
 * real Order, without ever touching the cart from inside the Server Action
 * itself (which has no access to localStorage).
 */
export function ClearCartOnMount() {
  const { clear } = useCart();

  useEffect(() => {
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
