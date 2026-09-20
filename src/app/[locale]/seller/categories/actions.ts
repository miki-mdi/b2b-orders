"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { checkActionCapability } from "@/lib/auth/permissions";
import { categoryInputSchema, fieldErrorsFromZod } from "@/lib/validation/catalog";
import { createCategory, setCategoryActive, updateCategory } from "@/lib/domain/catalog/category-service";
import type { FormState } from "@/lib/forms/form-state";

export async function createCategoryAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "catalog:write");
  if (forbidden) return forbidden;
  const parsed = categoryInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  try {
    await createCategory(session.tenantId, session.userId, parsed.data);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath("/", "layout");
  return redirect({ href: "/seller/categories", locale: await getLocale() });
}

export async function updateCategoryAction(
  id: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "catalog:write");
  if (forbidden) return forbidden;
  const parsed = categoryInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  try {
    await updateCategory(session.tenantId, session.userId, id, parsed.data);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath("/", "layout");
  return redirect({ href: "/seller/categories", locale: await getLocale() });
}

export async function toggleCategoryActiveAction(
  id: string,
  nextActive: boolean,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "catalog:write");
  if (forbidden) return forbidden;
  try {
    await setCategoryActive(session.tenantId, session.userId, id, nextActive);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}
