import { redirect } from "next/navigation";
import { auth } from "./auth";

export type AuthenticatedSession = {
  userId: string;
  userName: string;
};

/**
 * Layer 4 authorization for pages that need to know WHO is signed in but
 * must NOT require an active TENANT or CUSTOMER membership - unlike
 * requireSellerSession/requireBuyerSession, which redirect away a session
 * with no (or the wrong kind of) active membership.
 *
 * Exists specifically for /connections ("My collaborations" - see
 * docs/SESSION_HANDOFF.md's cross-seller relationship design note): a buyer
 * with only a PENDING TradingRelationship has no active CustomerMembership
 * yet, so requireBuyerSession() would redirect them away before they could
 * ever see or accept the invitation that would GIVE them that membership.
 * This is the one page in the app that genuinely only needs identity, not
 * authorization into a specific tenant/customer.
 */
export async function requireAuthenticatedSession(): Promise<AuthenticatedSession> {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  return {
    userId: session.user.id,
    userName: session.user.name,
  };
}
