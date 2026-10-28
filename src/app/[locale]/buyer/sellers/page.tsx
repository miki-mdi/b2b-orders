import { getTranslations } from "next-intl/server";
import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { listActiveCustomerMembershipsForUser } from "@/lib/auth/active-membership";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { selectActiveSellerAction } from "./actions";

/**
 * The buyer seller-switcher (see docs/SESSION_HANDOFF.md's cross-seller
 * relationship design note). Lists every seller this buyer is currently
 * ACTIVE with and lets them pick which one `requireBuyerSession()` resolves
 * to on THIS browser - see src/app/[locale]/buyer/sellers/actions.ts and
 * src/lib/auth/require-buyer.ts for how that selection is validated,
 * stored, and re-verified on every request.
 */
export default async function BuyerSellersPage() {
  const session = await requireBuyerSession();
  const t = await getTranslations("buyer.sellers");
  const options = await listActiveCustomerMembershipsForUser(session.userId);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader title={t("title")} />
      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      {options.length <= 1 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">{t("onlyOneSeller")}</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {options.map((option) => {
            const isCurrent = option.tenantId === session.tenantId && option.customerId === session.customerId;
            return (
              <Card
                key={option.membershipId}
                accentBorder={isCurrent}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="text-base font-semibold text-foreground">{option.tenantName}</p>
                  <p className="text-sm text-muted-foreground">{t("asCustomer", { name: option.customerName })}</p>
                </div>
                {isCurrent ? (
                  <span className="inline-block rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
                    {t("current")}
                  </span>
                ) : (
                  <form action={selectActiveSellerAction.bind(null, option.membershipId)}>
                    <Button type="submit" variant="secondary">
                      {t("select")}
                    </Button>
                  </form>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
