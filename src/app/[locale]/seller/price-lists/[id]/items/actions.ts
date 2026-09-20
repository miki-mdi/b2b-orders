"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { checkActionCapability } from "@/lib/auth/permissions";
import { priceListItemInputSchema, fieldErrorsFromZod } from "@/lib/validation/pricing";
import {
  createPriceListItem,
  deletePriceListItem,
  updatePriceListItem,
} from "@/lib/domain/pricing/price-list-item-service";
import type { FormState } from "@/lib/forms/form-state";

function errorToFormState(error: unknown): FormState {
  if (error instanceof Error && error.name === "DuplicateValueError") {
    return { status: "error", message: error.message, fieldErrors: { productUnitId: error.message } };
  }
  return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
}

export async function createPriceListItemAction(
  priceListId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "pricing:write");
  if (forbidden) return forbidden;
  const parsed = priceListItemInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  try {
    await createPriceListItem(session.tenantId, session.userId, priceListId, parsed.data);
  } catch (error) {
    return errorToFormState(error);
  }

  revalidatePath("/", "layout");
  return redirect({ href: `/seller/price-lists/${priceListId}/edit`, locale: await getLocale() });
}

export async function updatePriceListItemAction(
  priceListId: string,
  itemId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "pricing:write");
  if (forbidden) return forbidden;
  const parsed = priceListItemInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  try {
    await updatePriceListItem(session.tenantId, session.userId, itemId, { price: parsed.data.price });
  } catch (error) {
    return errorToFormState(error);
  }

  revalidatePath("/", "layout");
  return redirect({ href: `/seller/price-lists/${priceListId}/edit`, locale: await getLocale() });
}

export async function deletePriceListItemAction(
  id: string,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "pricing:write");
  if (forbidden) return forbidden;
  try {
    await deletePriceListItem(session.tenantId, session.userId, id);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}
