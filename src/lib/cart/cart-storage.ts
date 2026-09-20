/**
 * MVP cart design decision (Phase 1C brief §4): browser-persisted, NOT
 * server/session-persisted. The cart only ever stores { productUnitId,
 * quantity } - never a price, name, or anything else that could go stale or
 * be trusted at checkout. This keeps the cart out of the tenant-scoped
 * database entirely (no migration, no RLS policy, nothing to isolate)
 * because it carries no information that is sensitive or authoritative on
 * its own - every read of a cart (the cart page, checkout, and submission)
 * re-resolves price/availability from the database via resolveCartLine, and
 * submission re-validates everything again server-side regardless of what
 * the browser sends. See src/lib/domain/orders/cart-resolution.ts.
 *
 * Scoped per-browser, not per-account: acceptable for MVP (a buyer working
 * across two devices simply has two carts) and much simpler than a
 * DB-backed cart that would need its own tenant/customer scoping, RLS
 * policy, and migration for state that has no historical/audit value once
 * an order is actually submitted.
 */
export type CartItem = { productUnitId: string; quantity: number };

const STORAGE_KEY = "b2b-orders:cart:v1";

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.productUnitId === "string" &&
    candidate.productUnitId.length > 0 &&
    typeof candidate.quantity === "number" &&
    Number.isFinite(candidate.quantity) &&
    candidate.quantity > 0
  );
}

export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartItem);
  } catch {
    // Corrupt JSON, storage disabled (private browsing), or quota errors -
    // an empty cart is always a safe fallback, never a crash.
    return [];
  }
}

export function writeCart(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage unavailable/full - the cart just won't persist across a
    // reload; not fatal to the current page.
  }
}

export function clearCart(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
