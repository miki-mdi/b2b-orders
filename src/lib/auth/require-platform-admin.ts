import { redirect } from "next/navigation";
import { auth } from "./auth";

export type PlatformAdminSession = {
  userId: string;
  userName: string;
};

/**
 * Layer 4 authorization (docs/SECURITY_AND_MULTI_TENANCY.md §3), mirroring
 * requireSellerSession/requireBuyerSession: confirms `isPlatformAdmin` on
 * the current session before any platform-admin-only page proceeds (Phase
 * 1E's diagnostics area, per its explicit "available only to appropriate
 * platform/admin users" requirement). A seller or buyer session - even a
 * SELLER_ADMIN, who has no elevated platform privilege - is redirected away
 * exactly like require-seller.ts/require-buyer.ts redirect a mismatched
 * membership type.
 */
export async function requirePlatformAdminSession(): Promise<PlatformAdminSession> {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  if (!session.user.isPlatformAdmin) {
    redirect("/");
  }

  return {
    userId: session.user.id,
    userName: session.user.name,
  };
}
