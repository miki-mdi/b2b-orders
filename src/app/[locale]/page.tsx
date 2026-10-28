import type { SVGProps } from "react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth/auth";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LanguageThemeControls } from "@/components/language-theme-controls";
import { AppLogo } from "@/components/brand/app-logo";
import { Card } from "@/components/ui/card";
import "@/lib/auth/types";

/**
 * Buyer/Seller entry icons - same hand-written inline-SVG convention used
 * throughout this app (sign-in's sun/moon, the seller dashboard's
 * quick-action icons), kept local since they're specific to this page.
 */
function BuyerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M2.5 3h2.4l2.1 11.2a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.6L21 7H6" />
      <circle cx="9" cy="20" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SellerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3 9.5 4.5 4h15L21 9.5" />
      <path d="M3 9.5a2.3 2.3 0 0 0 4.4 1.1A2.3 2.3 0 0 0 12 9.5a2.3 2.3 0 0 0 4.4 1.1A2.3 2.3 0 0 0 21 9.5" />
      <path d="M5 11v9h14v-9" />
      <path d="M10 20v-5a2 2 0 0 1 4 0v5" />
    </svg>
  );
}

/**
 * Role-aware landing redirect - replaces the old Phase 0 debug view (which
 * rendered raw tenant/customer UUIDs and internal role codes) with a safe
 * handoff straight into the right product area.
 *
 * Makes no authorization decision of its own: reads
 * session.user.activeMembership/isPlatformAdmin exactly as already
 * resolved by resolveActiveMembership() (src/lib/auth/active-membership.ts) -
 * re-run fresh on every request, "first membership wins" if a user somehow
 * holds more than one (see that file's own comments) - this page only
 * routes based on what's already been decided there.
 *
 * Uses next/navigation's plain redirect() with bare, locale-less paths -
 * the same convention require-seller.ts/require-buyer.ts/
 * require-platform-admin.ts already use. next-intl's own middleware
 * (src/proxy.ts) adds the locale prefix on the follow-up request, so this
 * needs no locale of its own and the existing locale-handling behavior is
 * unchanged.
 *
 * The unauthenticated view below is a pure entry-page choice, not a role
 * selector - both cards link to the same /sign-in route. Real access is
 * still decided entirely by resolveActiveMembership() after a real sign-in,
 * exactly as above; this page has no way to influence that.
 */
export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    const membership = session.user.activeMembership;
    if (membership?.type === "TENANT") {
      redirect("/seller");
    }
    if (membership?.type === "CUSTOMER") {
      redirect("/buyer");
    }
    if (session.user.isPlatformAdmin) {
      redirect("/admin/diagnostics");
    }

    // Authenticated but genuinely has no accessible area left (e.g. the
    // only membership this account ever had has since been deactivated) -
    // nothing to redirect to, so this is the one signed-in case that still
    // renders, and it only ever shows a safe, non-technical message.
    const t = await getTranslations("home");
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">{t("noAccess")}</p>
        <Link href="/connections" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
          {t("connectionsLink")}
        </Link>
        <form
          action={async () => {
            "use server";
            await signOut();
          }}
        >
          <button type="submit" className="underline underline-offset-2">
            {t("signOut")}
          </button>
        </form>
        <LocaleSwitcher />
      </div>
    );
  }

  const t = await getTranslations("home");
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-8 p-4 sm:p-8">
      <div className="absolute right-4 top-4 sm:right-8 sm:top-8">
        <LanguageThemeControls />
      </div>

      <AppLogo size="lg" />

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold text-foreground">{t("entryHeadline")}</h1>
        <p className="max-w-md text-muted-foreground">{t("entrySubtitle")}</p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/sign-in">
          <Card
            accentBorder
            className="flex h-full flex-col items-center gap-3 p-6 text-center transition-colors hover:bg-muted"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
              <BuyerIcon className="h-7 w-7" />
            </span>
            <span className="text-lg font-semibold text-foreground">{t("buyerTitle")}</span>
            <span className="text-sm text-muted-foreground">{t("buyerDescription")}</span>
          </Card>
        </Link>

        <Link href="/sign-in">
          <Card
            accentBorder
            className="flex h-full flex-col items-center gap-3 p-6 text-center transition-colors hover:bg-muted"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
              <SellerIcon className="h-7 w-7" />
            </span>
            <span className="text-lg font-semibold text-foreground">{t("sellerTitle")}</span>
            <span className="text-sm text-muted-foreground">{t("sellerDescription")}</span>
          </Card>
        </Link>
      </div>
    </div>
  );
}
