"use server";

import { revalidatePath } from "next/cache";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { checkActionCapability } from "@/lib/auth/permissions";
import { setCustomerProductVisibility } from "@/lib/domain/customers/customer-product-visibility-service";
import type { FormState } from "@/lib/forms/form-state";

export async function setCustomerProductVisibilityAction(
  customerId: string,
  productId: string,
  nextVisibility: "VISIBLE" | "HIDDEN" | null,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "customer-visibility:write");
  if (forbidden) return forbidden;
  try {
    await setCustomerProductVisibility(session.tenantId, session.userId, customerId, productId, nextVisibility);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}
