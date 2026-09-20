"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { checkActionCapability } from "@/lib/auth/permissions";
import { customerAddressInputSchema, fieldErrorsFromZod } from "@/lib/validation/customers";
import {
  createCustomerAddress,
  setCustomerAddressActive,
  updateCustomerAddress,
} from "@/lib/domain/customers/customer-address-service";
import type { FormState } from "@/lib/forms/form-state";

export async function createCustomerAddressAction(
  customerId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "customers:addresses:write");
  if (forbidden) return forbidden;
  const parsed = customerAddressInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  try {
    await createCustomerAddress(session.tenantId, session.userId, customerId, parsed.data);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath("/", "layout");
  return redirect({ href: `/seller/customers/${customerId}/edit`, locale: await getLocale() });
}

export async function updateCustomerAddressAction(
  customerId: string,
  addressId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "customers:addresses:write");
  if (forbidden) return forbidden;
  const parsed = customerAddressInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  try {
    await updateCustomerAddress(session.tenantId, session.userId, addressId, parsed.data);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath("/", "layout");
  return redirect({ href: `/seller/customers/${customerId}/edit`, locale: await getLocale() });
}

export async function toggleCustomerAddressActiveAction(
  id: string,
  nextActive: boolean,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "customers:addresses:deactivate");
  if (forbidden) return forbidden;
  try {
    await setCustomerAddressActive(session.tenantId, session.userId, id, nextActive);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}
