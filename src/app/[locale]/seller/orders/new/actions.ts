"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { checkActionCapability, hasCapability } from "@/lib/auth/permissions";
import { cartLinesQuerySchema, sellerOrderInputSchema, fieldErrorsFromZod } from "@/lib/validation/orders";
import { resolveCartLine, type ResolvedCartLine } from "@/lib/domain/orders/cart-resolution";
import { submitOrder } from "@/lib/domain/orders/order-service";
import type { FormState } from "@/lib/forms/form-state";

/**
 * Read-only preview for the seller-entered-order basket - identical in
 * spirit to the buyer's resolveCartAction (src/app/[locale]/buyer/cart/actions.ts),
 * just gated by requireSellerSession instead and taking an explicit
 * customerId (the seller can act on behalf of any of their tenant's
 * customers, not just "their own"). resolveCartLine itself is exactly the
 * same function the buyer flow uses - the customer's own pricing/discount/
 * visibility rules apply unchanged, with no seller override.
 */
export async function resolveSellerOrderLinesAction(
  customerId: string,
  items: { productUnitId: string; quantity: number }[]
): Promise<{ lines: ResolvedCartLine[] }> {
  const session = await requireSellerSession();
  if (!hasCapability(session.role, "orders:create")) {
    return { lines: [] };
  }
  const parsed = cartLinesQuerySchema.safeParse(items);
  if (!parsed.success || parsed.data.length === 0 || !customerId) {
    return { lines: [] };
  }

  const lines = await Promise.all(
    parsed.data.map((line) => resolveCartLine(session.tenantId, customerId, line.productUnitId, line.quantity))
  );
  return { lines };
}

export async function createSellerOrderAction(prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "orders:create");
  if (forbidden) return forbidden;
  const locale = await getLocale();

  let basketLines: unknown = [];
  try {
    basketLines = JSON.parse(String(formData.get("basketJson") ?? "[]"));
  } catch {
    return { status: "error", message: "The basket data could not be read - please try again." };
  }

  const parsed = sellerOrderInputSchema.safeParse({
    customerId: formData.get("customerId"),
    deliveryAddressId: formData.get("deliveryAddressId"),
    note: formData.get("note"),
    requestedDeliveryDate: formData.get("requestedDeliveryDate"),
    lines: basketLines,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  // submitOrder re-resolves every line's price/availability itself, exactly
  // as it does for a buyer's own checkout - the seller gets no special
  // pricing path. actingContext "TENANT" (vs "CUSTOMER" for the buyer's own
  // checkout) is what records, in the audit log, that this order was
  // entered by the seller rather than submitted by the buyer.
  const result = await submitOrder(
    session.tenantId,
    parsed.data.customerId,
    session.userId,
    session.userName,
    session.role,
    "TENANT",
    parsed.data
  );

  if (!result.ok) {
    switch (result.reason) {
      case "EMPTY_CART":
        return { status: "error", message: "Add at least one product before creating the order." };
      case "ADDRESS_NOT_FOUND":
        return {
          status: "error",
          message: "That delivery address is not available for this customer.",
          fieldErrors: { deliveryAddressId: "This address is not available for this customer." },
        };
      case "CUSTOMER_INACTIVE":
        return { status: "error", message: "This customer is not currently active." };
      case "LINE_ISSUES":
        return {
          status: "error",
          message: "One or more items in the basket could not be ordered for this customer - please review.",
        };
      default:
        throw new Error("Unreachable submitOrder result reason.");
    }
  }

  return redirect({ href: `/seller/orders/${result.order.id}`, locale });
}
