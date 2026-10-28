import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { resolveActiveMembership } from "./active-membership";

export type BuyerSession = {
  userId: string;
  userName: string;
  tenantId: string;
  customerId: string;
  role: "BUYER_ADMIN" | "BUYER_EMPLOYEE";
};

/** The seller-switcher's per-browser preference - see the module comment below and /[locale]/buyer/sellers/actions.ts, the only place that sets it. */
export const ACTIVE_BUYER_MEMBERSHIP_COOKIE = "activeBuyerMembershipId";

/**
 * Layer 4 authorization (docs/SECURITY_AND_MULTI_TENANCY.md §3): confirms
 * the current session is an active CUSTOMER membership before any
 * buyer-side page or Server Action proceeds, and returns the
 * tenantId/customerId to use. Mirrors src/lib/auth/require-seller.ts -
 * this is the ONLY place buyer-side code should get a customerId from,
 * never a route param, form field, or query string.
 *
 * Buyer seller-switcher: re-resolves membership HERE, via
 * resolveActiveMembership(), rather than trusting session.user.activeMembership
 * (which the Auth.js jwt callback in auth.ts already resolved, with no
 * knowledge of any cookie - that callback is deliberately left unchanged).
 * The `activeBuyerMembershipId` cookie, read fresh on every request, is
 * passed through as nothing more than a hint; resolveActiveMembership
 * re-validates it against the user's freshly loaded, currently-valid
 * memberships on every single call, so a stale, forged, or foreign cookie
 * value can never grant access - it just fails to match anything and this
 * falls back to the exact same default resolution as before the switcher
 * existed. The cookie is also never read anywhere else, and never trusted
 * for its raw tenantId/customerId (it doesn't contain either - just an
 * opaque CustomerMembership id).
 */
export async function requireBuyerSession(): Promise<BuyerSession> {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  const cookieStore = await cookies();
  const preferredMembershipId = cookieStore.get(ACTIVE_BUYER_MEMBERSHIP_COOKIE)?.value;

  const identity = await resolveActiveMembership(session.user.id, preferredMembershipId);
  if (!identity.isActive) {
    // Deactivated since the JWT was last issued - same outcome as an
    // already-signed-out session.
    redirect("/sign-in");
  }

  const membership = identity.activeMembership;
  if (!membership || membership.type !== "CUSTOMER") {
    // A platform admin or a seller session has no business on buyer routes.
    redirect("/");
  }

  return {
    userId: session.user.id,
    userName: session.user.name,
    tenantId: membership.tenantId,
    customerId: membership.customerId,
    role: membership.role,
  };
}
