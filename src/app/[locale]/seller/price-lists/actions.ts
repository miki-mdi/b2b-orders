"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { priceListInputSchema, fieldErrorsFromZod } from "@/lib/validation/pricing";
import { createPriceList, setPriceListActive, updatePriceList } from "@/lib/domain/pricing/price-list-service";
import type { FormState } from "@/lib/forms/form-state";

function errorToFormState(error: unknown): FormState {
  if (error instanceof Error && error.name === "DuplicateValueError") {
    const field = (error as Error & { field?: string }).field ?? "code";
    return { status: "error", message: error.message, fieldErrors: { [field]: error.message } };
  }
  return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
}

export async function createPriceListAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSellerSession();
  const parsed = priceListInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  let priceListId: string;
  try {
    const priceList = await createPriceList(session.tenantId, session.userId, parsed.data);
    priceListId = priceList.id;
  } catch (error) {
    return errorToFormState(error);
  }

  revalidatePath("/", "layout");
  return redirect({ href: `/seller/price-lists/${priceListId}/edit`, locale: await getLocale() });
}

export async function updatePriceListAction(
  id: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const parsed = priceListInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  try {
    await updatePriceList(session.tenantId, session.userId, id, parsed.data);
  } catch (error) {
    return errorToFormState(error);
  }

  revalidatePath("/", "layout");
  return redirect({ href: "/seller/price-lists", locale: await getLocale() });
}

export async function togglePriceListActiveAction(
  id: string,
  nextActive: boolean,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  try {
    await setPriceListActive(session.tenantId, session.userId, id, nextActive);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}
