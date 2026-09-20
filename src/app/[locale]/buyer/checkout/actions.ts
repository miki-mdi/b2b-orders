"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { submitOrderInputSchema, fieldErrorsFromZod } from "@/lib/validation/orders";
import { submitOrder } from "@/lib/domain/orders/order-service";
import type { FormState } from "@/lib/forms/form-state";

export async function submitOrderAction(prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireBuyerSession();
  const locale = await getLocale();

  let cartLines: unknown = [];
  try {
    cartLines = JSON.parse(String(formData.get("cartJson") ?? "[]"));
  } catch {
    return { status: "error", message: "Your cart data could not be read - please go back to your cart and try again." };
  }

  const parsed = submitOrderInputSchema.safeParse({
    deliveryAddressId: formData.get("deliveryAddressId"),
    note: formData.get("note"),
    requestedDeliveryDate: formData.get("requestedDeliveryDate"),
    lines: cartLines,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  // submitOrder re-resolves every line's price/availability itself - the
  // parsed `lines` here are only ever { productUnitId, quantity } (see
  // src/lib/validation/orders.ts), never a price.
  const result = await submitOrder(
    session.tenantId,
    session.customerId,
    session.userId,
    session.userName,
    session.role,
    "CUSTOMER",
    parsed.data
  );

  if (!result.ok) {
    switch (result.reason) {
      case "EMPTY_CART":
        return { status: "error", message: "Your cart is empty." };
      case "ADDRESS_NOT_FOUND":
        return {
          status: "error",
          message: "That delivery address is no longer available.",
          fieldErrors: { deliveryAddressId: "This address is no longer available." },
        };
      case "CUSTOMER_INACTIVE":
        return { status: "error", message: "Your account is not currently active - contact your seller." };
      case "LINE_ISSUES":
        return {
          status: "error",
          message: "One or more items in your cart changed and could not be ordered - please review your cart.",
        };
      default:
        throw new Error("Unreachable submitOrder result reason.");
    }
  }

  return redirect({ href: `/buyer/orders/${result.order.id}?submitted=1`, locale });
}
