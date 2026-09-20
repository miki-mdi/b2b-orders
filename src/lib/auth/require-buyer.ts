import { redirect } from "next/navigation";
import { auth } from "./auth";

export type BuyerSession = {
  userId: string;
  userName: string;
  tenantId: string;
  customerId: string;
  role: "BUYER_ADMIN" | "BUYER_EMPLOYEE";
};

/**
 * Layer 4 authorization (docs/SECURITY_AND_MULTI_TENANCY.md §3): confirms
 * the current session is an active CUSTOMER membership before any
 * buyer-side page or Server Action proceeds, and returns the
 * tenantId/customerId to use. Mirrors src/lib/auth/require-seller.ts -
 * this is the ONLY place buyer-side code should get a customerId from,
 * never a route param, form field, or query string.
 */
export async function requireBuyerSession(): Promise<BuyerSession> {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  const membership = session.user.activeMembership;
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
