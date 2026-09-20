"use server";

import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { cartLinesQuerySchema } from "@/lib/validation/orders";
import { resolveCartLine, type ResolvedCartLine } from "@/lib/domain/orders/cart-resolution";

/**
 * Called from the client-side cart/checkout components (their contents live
 * in localStorage, never on the server) to turn { productUnitId, quantity }
 * pairs into live, priced, availability-checked lines. This is a read-only
 * PREVIEW - submitOrder (checkout/actions.ts) re-does this exact resolution
 * itself right before writing the Order, so nothing here is ever trusted as
 * the final price.
 */
export async function resolveCartAction(
  items: { productUnitId: string; quantity: number }[]
): Promise<{ lines: ResolvedCartLine[] }> {
  const session = await requireBuyerSession();
  const parsed = cartLinesQuerySchema.safeParse(items);
  if (!parsed.success || parsed.data.length === 0) {
    return { lines: [] };
  }

  const lines = await Promise.all(
    parsed.data.map((line) => resolveCartLine(session.tenantId, session.customerId, line.productUnitId, line.quantity))
  );
  return { lines };
}
