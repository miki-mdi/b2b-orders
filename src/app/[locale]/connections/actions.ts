"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-authenticated";
import { ACTIVE_BUYER_MEMBERSHIP_COOKIE } from "@/lib/auth/require-buyer";
import {
  acceptInvitation,
  declineInvitation,
  requestConnection,
  revokeConnectionAsBuyer,
  type RequestConnectionOutcome,
} from "@/lib/domain/trading-relationships/trading-relationship-service";
import type { FormState } from "@/lib/forms/form-state";

export async function acceptInvitationAction(
  relationshipId: string,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireAuthenticatedSession();
  const t = await getTranslations("connections");

  try {
    await acceptInvitation(session.userId, relationshipId);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : t("genericError") };
  }

  // Revalidate everything: this is the one action in the app that can
  // create a buyer's FIRST active membership, which changes what the home
  // page and buyer layout resolve to on the next navigation.
  revalidatePath("/", "layout");
  return { status: "success", message: t("accepted") };
}

export async function declineInvitationAction(
  relationshipId: string,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireAuthenticatedSession();
  const t = await getTranslations("connections");

  try {
    await declineInvitation(session.userId, relationshipId);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : t("genericError") };
  }

  revalidatePath("/", "layout");
  return { status: "success", message: t("declined") };
}

const REQUEST_SUCCESS_MESSAGE_KEY: Record<RequestConnectionOutcome, "requestSent" | "requestAlreadyPending"> = {
  created: "requestSent",
  "already-pending": "requestAlreadyPending",
  "re-requested": "requestSent",
};

export async function requestConnectionAction(
  tenantId: string,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireAuthenticatedSession();
  const t = await getTranslations("connections");

  try {
    const result = await requestConnection(session.userId, tenantId);
    revalidatePath("/", "layout");
    return { status: "success", message: t(REQUEST_SUCCESS_MESSAGE_KEY[result.outcome]) };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : t("genericError") };
  }
}

/**
 * Buyer self-revoke. Ends an ACTIVE collaboration the caller themselves
 * holds - see revokeConnectionAsBuyer's own ownership guarantee (discovery
 * only through the caller's own rows via withUserContext).
 *
 * Cookie hygiene only, per the seller-switcher's own security model
 * (src/lib/auth/require-buyer.ts): if the just-revoked relationship's
 * CustomerMembership was the one currently selected on THIS browser, clear
 * it. This is never the security boundary - requireBuyerSession() already
 * re-validates the cookie against freshly loaded, currently-active
 * memberships on every request, so a revoked membership can never be
 * selected again even if this cookie write were somehow skipped. Clearing
 * it is purely so the browser doesn't keep pointing at a now-meaningless
 * id after a successful self-revoke.
 */
export async function revokeConnectionAction(
  relationshipId: string,
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const session = await requireAuthenticatedSession();
  const t = await getTranslations("connections");

  let result;
  try {
    result = await revokeConnectionAsBuyer(session.userId, relationshipId);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : t("genericError") };
  }

  if (result.membershipId) {
    const cookieStore = await cookies();
    if (cookieStore.get(ACTIVE_BUYER_MEMBERSHIP_COOKIE)?.value === result.membershipId) {
      cookieStore.delete(ACTIVE_BUYER_MEMBERSHIP_COOKIE);
    }
  }

  revalidatePath("/", "layout");
  return { status: "success", message: t("revoked") };
}
