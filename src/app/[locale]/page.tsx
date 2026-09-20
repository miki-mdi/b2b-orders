import type { Session } from "next-auth";
import { getTranslations } from "next-intl/server";
import { auth, signOut } from "@/lib/auth/auth";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import "@/lib/auth/types";

// Deliberately minimal: Phase 0 proves auth + i18n + tenant-scoping work
// end-to-end, it does not build the seller/buyer product screens - those
// are Phase 1-3, see docs/DEVELOPMENT_PLAN.md.
export default async function HomePage() {
  const t = await getTranslations("home");
  const tMembership = await getTranslations("membership");
  const session = await auth();

  const membershipDescription = getMembershipDescription(session, tMembership);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">{t("tagline")}</p>

      <div className="flex flex-col items-center gap-2">
        {session?.user ? (
          <>
            <p>{t("signedInAs", { name: session.user.name })}</p>
            <p>{membershipDescription ?? t("noMembership")}</p>
            {session.user.activeMembership?.type === "TENANT" && (
              <Link href="/seller" className="underline underline-offset-2">
                {t("sellerAdmin")}
              </Link>
            )}
            {session.user.activeMembership?.type === "CUSTOMER" && (
              <Link href="/buyer" className="underline underline-offset-2">
                {t("buyerPortal")}
              </Link>
            )}
            {session.user.isPlatformAdmin && (
              <Link href="/admin/diagnostics" className="underline underline-offset-2">
                {t("diagnostics")}
              </Link>
            )}
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
          </>
        ) : (
          <>
            <p>{t("notSignedIn")}</p>
            <Link href="/sign-in" className="underline underline-offset-2">
              {t("signIn")}
            </Link>
          </>
        )}
      </div>

      <LocaleSwitcher />
    </div>
  );
}

function getMembershipDescription(
  session: Session | null,
  tMembership: Awaited<ReturnType<typeof getTranslations<"membership">>>
): string | null {
  if (!session?.user) return null;
  if (session.user.isPlatformAdmin) return tMembership("platformAdmin");

  const membership = session.user.activeMembership;
  if (!membership) return null;

  if (membership.type === "TENANT") {
    return tMembership("tenant", { tenantId: membership.tenantId, role: membership.role });
  }
  return tMembership("customer", { customerId: membership.customerId, role: membership.role });
}
