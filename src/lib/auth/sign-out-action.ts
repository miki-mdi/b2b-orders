"use server";

import { signOut } from "./auth";

/**
 * The one sanctioned sign-out path for every authenticated area (seller,
 * buyer, admin, /connections - see src/components/sign-out-button.tsx).
 * Reuses Auth.js's own signOut() (src/lib/auth/auth.ts) exactly as the home
 * page's "no access" state already did inline before this existed - never
 * a bespoke cookie-clearing or session-invalidation path, and no second
 * authentication system.
 *
 * `redirectTo` is a bare, locale-less path, the same established
 * convention require-seller.ts/require-buyer.ts/require-platform-admin.ts
 * already use for every other auth redirect in this app: next-intl's own
 * middleware (src/proxy.ts) adds the locale prefix on the follow-up
 * request, landing on e.g. /mk/sign-in or /en/sign-in.
 */
export async function signOutAction() {
  await signOut({ redirectTo: "/sign-in" });
}
