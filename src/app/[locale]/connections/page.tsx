import { getTranslations } from "next-intl/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-authenticated";
import {
  listActiveCollaborationsForUser,
  listActiveSellerTenants,
  listOwnRelationshipStatusByTenant,
  listPendingSellerInvitationsForUser,
} from "@/lib/domain/trading-relationships/trading-relationship-service";
import { Link } from "@/i18n/navigation";
import { LanguageThemeControls } from "@/components/language-theme-controls";
import { SignOutButton } from "@/components/sign-out-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/form-field";
import {
  acceptInvitationAction,
  declineInvitationAction,
  requestConnectionAction,
  revokeConnectionAction,
} from "./actions";
import { InvitationCard } from "./invitation-card";
import { SellerDirectoryCard } from "./seller-directory-card";
import { ActiveCollaborationCard } from "./active-collaboration-card";

/**
 * "My collaborations" - a neutral, role-agnostic page outside the /buyer and
 * /seller layouts (see docs/SESSION_HANDOFF.md's cross-seller relationship
 * design note). A buyer with only a PENDING TradingRelationship - or none at
 * all yet - has no active CustomerMembership, so requireBuyerSession() would
 * redirect them away before they could ever see/accept an invitation or
 * find a seller to request one from - requireAuthenticatedSession() only
 * needs identity, not an active membership of any kind.
 *
 * Same minimal thin-strip approach as admin/layout.tsx and buyer/layout.tsx
 * for a page with no app-bar of its own.
 */
export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireAuthenticatedSession();
  const t = await getTranslations("connections");
  // "home" namespace deliberately reused - see seller/layout.tsx's identical comment.
  const tHome = await getTranslations("home");
  const { q } = await searchParams;

  // Sequential, not Promise.all - this codebase has repeatedly observed
  // concurrent tenant-scoped transactions starving the local dev Postgres
  // connection pool (see src/lib/domain/admin/admin-service.ts), and most
  // of these calls open their own transactions internally.
  const activeCollaborations = await listActiveCollaborationsForUser(session.userId);
  const invitations = await listPendingSellerInvitationsForUser(session.userId);
  const sellers = await listActiveSellerTenants(q);
  const relationshipStatusByTenant = await listOwnRelationshipStatusByTenant(session.userId);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border p-2">
        <Link href="/" className="px-2 text-sm text-muted-foreground hover:text-foreground">
          {t("backToSite")}
        </Link>
        <div className="flex items-center gap-3">
          <SignOutButton label={tHome("signOut")} />
          <LanguageThemeControls />
        </div>
      </div>

      <main className="flex-1 p-4 md:p-8">
        <div className="flex max-w-xl flex-col gap-10">
          <div className="flex flex-col gap-6">
            <PageHeader title={t("title")} />
            <p className="text-sm text-muted-foreground">{t("intro")}</p>

            {invitations.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">{t("empty")}</Card>
            ) : (
              <div className="flex flex-col gap-4">
                {invitations.map((invitation) => (
                  <InvitationCard
                    key={invitation.id}
                    sellerName={invitation.tenant.name}
                    customerName={invitation.customerName}
                    acceptAction={acceptInvitationAction.bind(null, invitation.id)}
                    declineAction={declineInvitationAction.bind(null, invitation.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {activeCollaborations.length > 0 && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t("activeCollaborationsTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("activeCollaborationsIntro")}</p>
              </div>
              <div className="flex flex-col gap-4">
                {activeCollaborations.map((collaboration) => (
                  <ActiveCollaborationCard
                    key={collaboration.relationshipId}
                    sellerName={collaboration.tenantName}
                    customerName={collaboration.customerName}
                    revokeAction={revokeConnectionAction.bind(null, collaboration.relationshipId)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t("findSellersTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("findSellersIntro")}</p>
            </div>

            <Card accentBorder className="p-3">
              <form method="GET" className="flex flex-col gap-2 sm:flex-row">
                <label className="sr-only" htmlFor="connections-seller-search">
                  {t("searchPlaceholder")}
                </label>
                <input
                  id="connections-seller-search"
                  type="search"
                  name="q"
                  defaultValue={q ?? ""}
                  placeholder={t("searchPlaceholder")}
                  className={`flex-1 ${inputStyles}`}
                />
                <Button type="submit">{t("search")}</Button>
              </form>
            </Card>

            {sellers.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">{t("noSellersFound")}</Card>
            ) : (
              <div className="flex flex-col gap-3">
                {sellers.map((seller) => {
                  const rawStatus = relationshipStatusByTenant.get(seller.id);
                  const status = rawStatus === "ACTIVE" || rawStatus === "PENDING" ? rawStatus : null;
                  return (
                    <SellerDirectoryCard
                      key={seller.id}
                      sellerName={seller.name}
                      status={status}
                      requestAction={requestConnectionAction.bind(null, seller.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
