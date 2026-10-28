"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { ACTIVE_BUYER_MEMBERSHIP_COOKIE } from "@/lib/auth/require-buyer";
import { findOwnActiveCustomerMembership } from "@/lib/auth/active-membership";
import { env } from "@/lib/validation/env";

/**
 * The buyer seller-switcher's only write path. Sets a per-browser,
 * HttpOnly, session cookie (no expires/maxAge - cleared when the browser
 * closes) naming nothing more than an opaque CustomerMembership id. Never
 * writes CustomerMembership, TradingRelationship, User, or Tenant - this
 * action performs no business-data mutation at all, only a cookie write.
 *
 * Validates the requested membership through findOwnActiveCustomerMembership
 * (withUserContext's self-row RLS access, plus an active-membership/
 * active-customer/active-tenant check) BEFORE ever touching the cookie - a
 * foreign, inactive, or otherwise invalid id is silently ignored (the
 * cookie is simply not set), never surfaced as a distinguishable error,
 * matching the same "opaque hint, never trusted" posture
 * requireBuyerSession() already applies when READING this same cookie.
 */
export async function selectActiveSellerAction(membershipId: string) {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const membership = await findOwnActiveCustomerMembership(session.user.id, membershipId);
  if (membership) {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_BUYER_MEMBERSHIP_COOKIE, membership.membershipId, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }

  redirect("/buyer/sellers");
}
