import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

// Renamed from `middleware.ts` per Next.js 16's file convention rename
// (see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md,
// "Migration to Proxy") - `middleware.ts` is deprecated in this version and
// is no longer invoked at all, which silently broke the locale
// redirect/rewrite for every unprefixed URL (discovered while testing
// requireBuyerSession's/requireSellerSession's `redirect("/")` and
// `redirect("/sign-in")` calls, which target the bare, un-prefixed path -
// those 404'd instead of landing on the localized page). next-intl's
// createMiddleware itself is unchanged; only the file name/export Next.js
// looks for changed.
export default createMiddleware(routing);

export const config = {
  // Run on everything except Next.js internals, API routes, and files with an extension.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
