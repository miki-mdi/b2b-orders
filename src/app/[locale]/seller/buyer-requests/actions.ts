"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { checkActionCapability } from "@/lib/auth/permissions";
import { sellerAcceptRequest, sellerDeclineRequest } from "@/lib/domain/trading-relationships/trading-relationship-service";
import type { FormState } from "@/lib/forms/form-state";

export async function acceptBuyerRequestAction(
  relationshipId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "customers:write:full");
  if (forbidden) return forbidden;

  const t = await getTranslations("seller.buyerRequests");

  const customerId = formData.get("customerId");
  if (typeof customerId !== "string" || customerId.trim() === "") {
    return { status: "error", message: t("selectCustomerRequired") };
  }

  try {
    await sellerAcceptRequest(session.tenantId, session.userId, relationshipId, customerId);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : t("genericError") };
  }

  // Revalidate everything: this is the one action in the app that can
  // create a buyer's FIRST CustomerMembership at this tenant, which changes
  // what they see on their next /buyer navigation.
  revalidatePath("/", "layout");
  return { status: "success", message: t("accepted") };
}

export async function declineBuyerRequestAction(
  relationshipId: string,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "customers:write:full");
  if (forbidden) return forbidden;

  const t = await getTranslations("seller.buyerRequests");

  try {
    await sellerDeclineRequest(session.tenantId, session.userId, relationshipId);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : t("genericError") };
  }

  revalidatePath("/", "layout");
  return { status: "success", message: t("declined") };
}
