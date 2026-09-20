"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { checkActionCapability, hasCapability } from "@/lib/auth/permissions";
import { customerContactInfoInputSchema, customerInputSchema, fieldErrorsFromZod } from "@/lib/validation/customers";
import {
  createCustomer,
  setCustomerActive,
  updateCustomer,
  updateCustomerContactInfo,
} from "@/lib/domain/customers/customer-service";
import type { FormState } from "@/lib/forms/form-state";

function errorToFormState(error: unknown): FormState {
  if (error instanceof Error && error.name === "DuplicateValueError") {
    const field = (error as Error & { field?: string }).field ?? "code";
    return { status: "error", message: error.message, fieldErrors: { [field]: error.message } };
  }
  return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
}

export async function createCustomerAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSellerSession();
  // Creating a new customer record is beyond "limited edit" - Seller Admin only.
  const forbidden = checkActionCapability(session, "customers:write:full");
  if (forbidden) return forbidden;
  const parsed = customerInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  let customerId: string;
  try {
    const customer = await createCustomer(session.tenantId, session.userId, parsed.data);
    customerId = customer.id;
  } catch (error) {
    return errorToFormState(error);
  }

  revalidatePath("/", "layout");
  return redirect({ href: `/seller/customers/${customerId}/edit`, locale: await getLocale() });
}

/**
 * Branches on capability rather than the role directly: Seller Admin (full
 * write) edits every field via the same customerInputSchema/updateCustomer
 * this always used; Sales Rep (limited write) is redirected through the
 * narrower customerContactInfoInputSchema/updateCustomerContactInfo instead,
 * which can only ever touch contactEmail/contactPhone/notes - see that
 * function's own comment for why the restriction lives there too, not just
 * in this schema choice. Neither branch runs at all without one of the two
 * capabilities.
 */
export async function updateCustomerAction(id: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSellerSession();

  if (hasCapability(session.role, "customers:write:full")) {
    const parsed = customerInputSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
    }
    try {
      await updateCustomer(session.tenantId, session.userId, id, parsed.data);
    } catch (error) {
      return errorToFormState(error);
    }
    revalidatePath("/", "layout");
    return redirect({ href: "/seller/customers", locale: await getLocale() });
  }

  const forbidden = checkActionCapability(session, "customers:write:limited");
  if (forbidden) return forbidden;

  const parsed = customerContactInfoInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  try {
    await updateCustomerContactInfo(session.tenantId, session.userId, id, parsed.data);
  } catch (error) {
    return errorToFormState(error);
  }
  revalidatePath("/", "layout");
  return redirect({ href: "/seller/customers", locale: await getLocale() });
}

export async function toggleCustomerActiveAction(
  id: string,
  nextActive: boolean,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "customers:activate");
  if (forbidden) return forbidden;
  try {
    await setCustomerActive(session.tenantId, session.userId, id, nextActive);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}
