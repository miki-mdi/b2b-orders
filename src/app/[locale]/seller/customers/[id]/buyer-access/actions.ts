"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { checkActionCapability } from "@/lib/auth/permissions";
import { inviteBuyerInputSchema } from "@/lib/validation/trading-relationships";
import { fieldErrorsFromZod } from "@/lib/validation/customers";
import { inviteBuyerForCustomer, revokeConnectionAsSeller } from "@/lib/domain/trading-relationships/trading-relationship-service";
import type { FormState } from "@/lib/forms/form-state";

const SUCCESS_MESSAGE_KEY = {
  created: "successCreated",
  "already-pending": "successAlreadyPending",
  reinvited: "successReinvited",
} as const;

export async function inviteBuyerAction(
  customerId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "customers:write:full");
  if (forbidden) return forbidden;

  const parsed = inviteBuyerInputSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }

  const t = await getTranslations("seller.buyerAccess");

  try {
    const result = await inviteBuyerForCustomer(session.tenantId, session.userId, customerId, parsed.data.email);
    revalidatePath("/", "layout");
    return { status: "success", message: t(SUCCESS_MESSAGE_KEY[result.outcome]) };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : t("genericError") };
  }
}

/**
 * Seller-side revoke of an ACTIVE relationship. `customerId` is always the
 * Customer this exact page (/seller/customers/[id]) is already scoped to -
 * never read from the relationship row or form data - so revokeConnectionAsSeller
 * can confirm the relationship truly belongs to the customer currently
 * being viewed before anything is written. Never touches cookies - a
 * seller has no business altering a buyer's browser.
 */
export async function revokeBuyerAccessAction(
  customerId: string,
  relationshipId: string,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "customers:write:full");
  if (forbidden) return forbidden;

  const t = await getTranslations("seller.buyerAccess");

  try {
    await revokeConnectionAsSeller(session.tenantId, session.userId, customerId, relationshipId);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : t("genericError") };
  }

  revalidatePath("/", "layout");
  return { status: "success", message: t("revoked") };
}
