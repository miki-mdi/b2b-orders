"use server";

import { revalidatePath } from "next/cache";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { checkActionCapability } from "@/lib/auth/permissions";
import { customerPriceListAssignmentInputSchema } from "@/lib/validation/pricing";
import { customerDiscountInputSchema } from "@/lib/validation/customers";
import { setCustomerPriceListAssignment } from "@/lib/domain/customers/customer-price-list-assignment-service";
import { setCustomerDiscount } from "@/lib/domain/customers/customer-discount-service";
import type { FormState } from "@/lib/forms/form-state";

export async function updateCustomerAssignmentAction(
  customerId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "pricing:write");
  if (forbidden) return forbidden;
  const parsed = customerPriceListAssignmentInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please select a valid price list." };
  }

  try {
    await setCustomerPriceListAssignment(session.tenantId, session.userId, customerId, parsed.data.priceListId);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath("/", "layout");
  return { status: "success" };
}

export async function updateCustomerDiscountAction(
  customerId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "pricing:write");
  if (forbidden) return forbidden;
  const parsed = customerDiscountInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the errors below.",
      fieldErrors: { discountPercent: parsed.error.issues[0]?.message ?? "Invalid discount" },
    };
  }

  try {
    await setCustomerDiscount(session.tenantId, session.userId, customerId, parsed.data.discountPercent);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath("/", "layout");
  return { status: "success" };
}
