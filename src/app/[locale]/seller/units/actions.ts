"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { checkActionCapability } from "@/lib/auth/permissions";
import { unitOfMeasureInputSchema, fieldErrorsFromZod } from "@/lib/validation/catalog";
import { createUnitOfMeasure, setUnitOfMeasureActive, updateUnitOfMeasure } from "@/lib/domain/catalog/unit-of-measure-service";
import type { FormState } from "@/lib/forms/form-state";

export async function createUnitOfMeasureAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "catalog:write");
  if (forbidden) return forbidden;
  const parsed = unitOfMeasureInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  try {
    await createUnitOfMeasure(session.tenantId, session.userId, parsed.data);
  } catch (error) {
    if (error instanceof Error && error.name === "DuplicateValueError") {
      return { status: "error", message: error.message, fieldErrors: { code: error.message } };
    }
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath("/", "layout");
  return redirect({ href: "/seller/units", locale: await getLocale() });
}

export async function updateUnitOfMeasureAction(
  id: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "catalog:write");
  if (forbidden) return forbidden;
  const parsed = unitOfMeasureInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  try {
    await updateUnitOfMeasure(session.tenantId, session.userId, id, parsed.data);
  } catch (error) {
    if (error instanceof Error && error.name === "DuplicateValueError") {
      return { status: "error", message: error.message, fieldErrors: { code: error.message } };
    }
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath("/", "layout");
  return redirect({ href: "/seller/units", locale: await getLocale() });
}

export async function toggleUnitOfMeasureActiveAction(
  id: string,
  nextActive: boolean,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "catalog:write");
  if (forbidden) return forbidden;
  try {
    await setUnitOfMeasureActive(session.tenantId, session.userId, id, nextActive);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}
