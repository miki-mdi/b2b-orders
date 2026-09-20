"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { checkActionCapability } from "@/lib/auth/permissions";
import { productUnitInputSchema, fieldErrorsFromZod } from "@/lib/validation/catalog";
import { createProductUnit, setProductUnitActive, updateProductUnit } from "@/lib/domain/catalog/product-unit-service";
import type { FormState } from "@/lib/forms/form-state";

function errorToFormState(error: unknown): FormState {
  if (error instanceof Error && error.name === "DuplicateValueError") {
    const field = (error as Error & { field?: string }).field ?? "sku";
    return { status: "error", message: error.message, fieldErrors: { [field]: error.message } };
  }
  if (error instanceof Error && (error.name === "ProductNotFoundError" || error.name === "UnitOfMeasureNotFoundError")) {
    return { status: "error", message: error.message };
  }
  return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
}

export async function createProductUnitAction(
  productId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "catalog:write");
  if (forbidden) return forbidden;
  const parsed = productUnitInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  try {
    await createProductUnit(session.tenantId, session.userId, productId, parsed.data);
  } catch (error) {
    return errorToFormState(error);
  }

  revalidatePath("/", "layout");
  return redirect({ href: `/seller/products/${productId}/edit`, locale: await getLocale() });
}

export async function updateProductUnitAction(
  productId: string,
  unitId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "catalog:write");
  if (forbidden) return forbidden;
  const parsed = productUnitInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  try {
    await updateProductUnit(session.tenantId, session.userId, unitId, parsed.data);
  } catch (error) {
    return errorToFormState(error);
  }

  revalidatePath("/", "layout");
  return redirect({ href: `/seller/products/${productId}/edit`, locale: await getLocale() });
}

export async function toggleProductUnitActiveAction(
  id: string,
  nextActive: boolean,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "catalog:write");
  if (forbidden) return forbidden;
  try {
    await setProductUnitActive(session.tenantId, session.userId, id, nextActive);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}
