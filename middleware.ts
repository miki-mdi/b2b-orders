import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Run on everything except Next.js internals, API routes, and files with an extension.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
