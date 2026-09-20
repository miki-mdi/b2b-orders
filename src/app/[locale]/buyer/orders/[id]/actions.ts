"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { cancelOrderInputSchema } from "@/lib/validation/orders";
import {
  OrderNotCancellableError,
  OrderNotFoundError,
  requestOrderCancellation,
} from "@/lib/domain/orders/order-service";
import type { FormState } from "@/lib/forms/form-state";

export async function requestCancellationAction(
  orderId: string,
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireBuyerSession();
  const locale = await getLocale();

  const parsed = cancelOrderInputSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) {
    return { status: "error", message: "Invalid input." };
  }

  try {
    await requestOrderCancellation(session.tenantId, session.customerId, session.userId, orderId, parsed.data.reason);
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return { status: "error", message: "Order not found." };
    }
    if (error instanceof OrderNotCancellableError) {
      return { status: "error", message: "This order can no longer be cancelled." };
    }
    throw error;
  }

  return redirect({ href: `/buyer/orders/${orderId}`, locale });
}
