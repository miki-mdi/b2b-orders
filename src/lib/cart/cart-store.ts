"use client";

import { clearCart as clearCartStorage, readCart, writeCart, type CartItem } from "./cart-storage";

/**
 * A tiny external store over localStorage, read through React's
 * useSyncExternalStore (see use-cart.ts) rather than useState+useEffect -
 * this project's lint config (react-hooks/set-state-in-effect) flags
 * synchronous setState-in-an-effect, which is exactly the shape a naive
 * "read localStorage on mount" hook would otherwise take. This also gives
 * the correct SSR/hydration behavior for free: React renders
 * getServerSnapshot() (empty) during hydration and transitions to
 * getSnapshot() (the real cart) right after, without a manual "hydrated"
 * state flip.
 */
const EMPTY_CART: CartItem[] = [];

let cachedItems: CartItem[] = typeof window === "undefined" ? EMPTY_CART : readCart();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCartSnapshot(): CartItem[] {
  return cachedItems;
}

export function getServerCartSnapshot(): CartItem[] {
  return EMPTY_CART;
}

function commit(next: CartItem[]) {
  cachedItems = next;
  writeCart(next);
  emit();
}

export function addCartItem(productUnitId: string, quantity: number): void {
  const existing = cachedItems.find((item) => item.productUnitId === productUnitId);
  const next = existing
    ? cachedItems.map((item) =>
        item.productUnitId === productUnitId ? { ...item, quantity: item.quantity + quantity } : item
      )
    : [...cachedItems, { productUnitId, quantity }];
  commit(next);
}

export function setCartItemQuantity(productUnitId: string, quantity: number): void {
  const next =
    !Number.isFinite(quantity) || quantity <= 0
      ? cachedItems.filter((item) => item.productUnitId !== productUnitId)
      : cachedItems.map((item) => (item.productUnitId === productUnitId ? { ...item, quantity } : item));
  commit(next);
}

export function removeCartItem(productUnitId: string): void {
  commit(cachedItems.filter((item) => item.productUnitId !== productUnitId));
}

export function clearCartItems(): void {
  cachedItems = EMPTY_CART;
  clearCartStorage();
  emit();
}
