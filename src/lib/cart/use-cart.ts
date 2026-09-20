"use client";

import { useSyncExternalStore } from "react";
import {
  addCartItem,
  clearCartItems,
  getCartSnapshot,
  getServerCartSnapshot,
  removeCartItem,
  setCartItemQuantity,
  subscribeCart,
} from "./cart-store";
import { useHydrated } from "./use-hydrated";

export function useCart() {
  const items = useSyncExternalStore(subscribeCart, getCartSnapshot, getServerCartSnapshot);
  const hydrated = useHydrated();

  return {
    items,
    hydrated,
    addItem: addCartItem,
    setQuantity: setCartItemQuantity,
    removeItem: removeCartItem,
    clear: clearCartItems,
  };
}
