import { redirect } from "next/navigation";
import { auth } from "./auth";

export type SellerSession = {
  userId: string;
  userName: string;
  tenantId: string;
  role: "SELLER_ADMIN" | "SALES_REP" | "WAREHOUSE_WORKER" | "DELIVERY_DRIVER";
};

/**
 * Layer 4 authorization (docs/SECURITY_AND_MULTI_TENANCY.md §3): confirms
 * the current session is an active TENANT membership before any seller-side
 * page or Server Action proceeds, and returns the tenantId/userId to use.
 *
 * This is the ONLY place seller-side code should get a tenantId from - never
 * from a route param, form field, or query string. See
 * src/lib/db/tenant-context.ts's requireTenantId() for the matching
 * fail-safe on the data-access side.
 */
export async function requireSellerSession(): Promise<SellerSession> {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  const membership = session.user.activeMembership;
  if (!membership || membership.type !== "TENANT") {
    // A platform admin or a buyer session has no business on seller routes.
    redirect("/");
  }

  return {
    userId: session.user.id,
    userName: session.user.name,
    tenantId: membership.tenantId,
    role: membership.role,
  };
}
