import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability } from "@/lib/auth/permissions";
import { listPendingBuyerRequestsForTenant } from "@/lib/domain/trading-relationships/trading-relationship-service";
import { listCustomers } from "@/lib/domain/customers/customer-service";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { acceptBuyerRequestAction, declineBuyerRequestAction } from "./actions";
import { BuyerRequestCard } from "./buyer-request-card";

/**
 * "Buyer requests" - seller-side counterpart to buyer-initiated connection
 * requests from /[locale]/connections (Phase 4). Gated behind the same
 * "customers:write:full" capability used for creating/editing customers,
 * since accepting here creates or reactivates a CustomerMembership - the
 * same trust level as directly managing a customer record.
 */
export default async function BuyerRequestsPage() {
  const session = await requireSellerSession();
  requireSellerCapability(session, "customers:write:full");
  const t = await getTranslations("seller.buyerRequests");

  const requests = await listPendingBuyerRequestsForTenant(session.tenantId);
  const allCustomers = await listCustomers(session.tenantId);
  const activeCustomers = allCustomers.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} />
      <p className="max-w-2xl text-sm text-muted-foreground">{t("intro")}</p>
      <p className="max-w-2xl text-sm text-muted-foreground">
        {t("createCustomerNote")}{" "}
        <Link href="/seller/customers/new" className="font-medium text-primary underline-offset-2 hover:underline">
          {t("createCustomerLink")}
        </Link>
      </p>

      {requests.length === 0 ? (
        <Card className="max-w-2xl p-6 text-center text-sm text-muted-foreground">{t("empty")}</Card>
      ) : (
        <div className="flex max-w-2xl flex-col gap-4">
          {requests.map((request) => (
            <BuyerRequestCard
              key={request.id}
              relationshipId={request.id}
              buyerName={request.user.name}
              buyerEmail={request.user.email}
              customers={activeCustomers}
              acceptAction={acceptBuyerRequestAction.bind(null, request.id)}
              declineAction={declineBuyerRequestAction.bind(null, request.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
