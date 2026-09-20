"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { checkActionCapability } from "@/lib/auth/permissions";
import { productInputSchema, fieldErrorsFromZod } from "@/lib/validation/catalog";
import { createProduct, setProductActive, updateProduct } from "@/lib/domain/catalog/product-service";
import type { FormState } from "@/lib/forms/form-state";

function errorToFormState(error: unknown): FormState {
  if (error instanceof Error && error.name === "DuplicateValueError") {
    const field = (error as Error & { field?: string }).field ?? "sku";
    return { status: "error", message: error.message, fieldErrors: { [field]: error.message } };
  }
  if (error instanceof Error && error.name === "CategoryNotFoundError") {
    return { status: "error", message: error.message, fieldErrors: { categoryId: error.message } };
  }
  return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
}

export async function createProductAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "catalog:write");
  if (forbidden) return forbidden;
  const parsed = productInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  let productId: string;
  try {
    const product = await createProduct(session.tenantId, session.userId, parsed.data);
    productId = product.id;
  } catch (error) {
    return errorToFormState(error);
  }

  revalidatePath("/", "layout");
  return redirect({ href: `/seller/products/${productId}/edit`, locale: await getLocale() });
}

export async function updateProductAction(id: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "catalog:write");
  if (forbidden) return forbidden;
  const parsed = productInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  try {
    await updateProduct(session.tenantId, session.userId, id, parsed.data);
  } catch (error) {
    return errorToFormState(error);
  }

  revalidatePath("/", "layout");
  return redirect({ href: "/seller/products", locale: await getLocale() });
}

export async function toggleProductActiveAction(
  id: string,
  nextActive: boolean,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "catalog:write");
  if (forbidden) return forbidden;
  try {
    await setProductActive(session.tenantId, session.userId, id, nextActive);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}
