import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability, hasCapability } from "@/lib/auth/permissions";
import { getCustomer } from "@/lib/domain/customers/customer-service";
import { listPriceLists } from "@/lib/domain/pricing/price-list-service";
import { listCustomerProductVisibility } from "@/lib/domain/customers/customer-product-visibility-service";
import { listTradingRelationshipsForCustomer } from "@/lib/domain/trading-relationships/trading-relationship-service";
import { StatusBadge } from "@/components/seller/status-badge";
import { ToggleActiveForm } from "@/components/seller/toggle-active-form";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { CustomerForm } from "../../customer-form";
import { CustomerContactInfoForm } from "../../customer-contact-info-form";
import { updateCustomerAction } from "../../actions";
import { toggleCustomerAddressActiveAction } from "../addresses/actions";
import { updateCustomerAssignmentAction, updateCustomerDiscountAction } from "../pricing/actions";
import { PricingSection } from "../pricing/pricing-section";
import { setCustomerProductVisibilityAction } from "../visibility/actions";
import { VisibilityToggleForm } from "../visibility/visibility-toggle-form";
import { inviteBuyerAction, revokeBuyerAccessAction } from "../buyer-access/actions";
import { BuyerAccessForm } from "../buyer-access/buyer-access-form";
import { RevokeAccessButton } from "../buyer-access/revoke-access-button";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSellerSession();
  requireSellerCapability(session, "customers:read");
  const canEditFull = hasCapability(session.role, "customers:write:full");
  const canEditLimited = hasCapability(session.role, "customers:write:limited");
  const canManageAddresses = hasCapability(session.role, "customers:addresses:write");
  const canDeactivateAddresses = hasCapability(session.role, "customers:addresses:deactivate");
  const canWritePricing = hasCapability(session.role, "pricing:write");
  const canWriteVisibility = hasCapability(session.role, "customer-visibility:write");
  const canInviteBuyer = hasCapability(session.role, "customers:write:full");
  const t = await getTranslations("seller.customers");
  const tAddresses = await getTranslations("seller.addresses");
  const tPricing = await getTranslations("seller.pricing");
  const tVisibility = await getTranslations("seller.visibility");
  const tCommon = await getTranslations("seller.common");
  const tBuyerAccess = await getTranslations("seller.buyerAccess");

  const customer = await getCustomer(session.tenantId, id);
  if (!customer) {
    notFound();
  }
  const priceLists = await listPriceLists(session.tenantId);
  const visibilityRows = await listCustomerProductVisibility(session.tenantId, id);
  const tradingRelationships = await listTradingRelationshipsForCustomer(session.tenantId, id);

  const RELATIONSHIP_STATUS_KEY = {
    PENDING: "statusPending",
    ACTIVE: "statusActive",
    DECLINED: "statusDeclined",
    REVOKED: "statusRevoked",
  } as const;
  const RELATIONSHIP_STATUS_STYLE = {
    PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    DECLINED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
    REVOKED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
  } as const;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-2">
          <Link href="/seller/customers" className={buttonStyles("ghost")}>
            {tCommon("backToList")}
          </Link>
          <PageHeader title={canEditFull ? t("editTitle") : t("viewTitle")} />
        </div>
        <Card accentBorder className="max-w-xl p-6 lg:max-w-4xl xl:max-w-5xl">
          {canEditFull ? (
            <CustomerForm action={updateCustomerAction.bind(null, id)} customer={customer} />
          ) : canEditLimited ? (
            <CustomerContactInfoForm action={updateCustomerAction.bind(null, id)} customer={customer} />
          ) : (
            <CustomerForm action={updateCustomerAction.bind(null, id)} customer={customer} readOnly />
          )}
        </Card>
      </div>

      <div className="flex max-w-xl flex-col gap-6 lg:max-w-4xl xl:max-w-5xl">
        <Card accentBorder className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">{tAddresses("title")}</h2>
            {canManageAddresses && (
              <Link href={`/seller/customers/${id}/addresses/new`} className={buttonStyles("primary")}>
                {tCommon("addNew")}
              </Link>
            )}
          </div>

          {customer.addresses.length === 0 ? (
            <p className="rounded-control border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {tAddresses("empty")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-control border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium text-foreground">
                      {tAddresses("columnLabel")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium text-foreground">
                      {tAddresses("columnCity")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium text-foreground">
                      {tAddresses("columnDefault")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium text-foreground">
                      {tCommon("status")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium text-foreground">
                      {tCommon("actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {customer.addresses.map((address) => (
                    <tr key={address.id} className="border-t border-border">
                      <td className="px-4 py-2 text-foreground">{address.label}</td>
                      <td className="px-4 py-2 text-foreground">{address.city}</td>
                      <td className="px-4 py-2 text-foreground">{address.isDefaultDelivery ? "★" : ""}</td>
                      <td className="px-4 py-2">
                        <StatusBadge isActive={address.isActive} activeLabel={tCommon("active")} inactiveLabel={tCommon("inactive")} />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/seller/customers/${id}/addresses/${address.id}/edit`}
                            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {canManageAddresses ? tCommon("edit") : tCommon("view")}
                          </Link>
                          {canDeactivateAddresses && (
                            <ToggleActiveForm
                              action={toggleCustomerAddressActiveAction.bind(null, address.id, !address.isActive)}
                              isActive={address.isActive}
                              deactivateLabel={tCommon("deactivate")}
                              reactivateLabel={tCommon("reactivate")}
                              tone="danger"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card accentBorder className="flex flex-col gap-4 p-4">
          <h2 className="text-lg font-semibold text-foreground">{tPricing("title")}</h2>
          <PricingSection
            // Forces a remount when either value actually changes server-side.
            // Both the <select> and the discount <input> below are uncontrolled
            // (defaultValue only applies at mount) so they can support normal
            // typing without fighting React on every keystroke - but that same
            // uncontrolled-ness means they'd otherwise keep showing stale data
            // after a successful save that doesn't navigate away from this page
            // (see updateCustomerAssignmentAction/updateCustomerDiscountAction,
            // which intentionally stay on this page rather than redirecting).
            key={`${customer.priceListAssignment?.priceListId ?? "none"}-${customer.discountPercent?.toString() ?? "none"}`}
            assignAction={updateCustomerAssignmentAction.bind(null, id)}
            discountAction={updateCustomerDiscountAction.bind(null, id)}
            priceLists={priceLists}
            currentPriceListId={customer.priceListAssignment?.priceListId ?? null}
            currentDiscountPercent={customer.discountPercent?.toString() ?? null}
            readOnly={!canWritePricing}
          />
        </Card>

        <Card accentBorder className="flex flex-col gap-4 p-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{tVisibility("title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tVisibility("intro")}</p>
          </div>

          {visibilityRows.length === 0 ? (
            <p className="rounded-control border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {tVisibility("empty")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-control border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium text-foreground">
                      {tVisibility("columnProduct")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium text-foreground">
                      {tVisibility("columnStatus")}
                    </th>
                    {canWriteVisibility && (
                      <th scope="col" className="px-4 py-2 font-medium text-foreground">
                        {tCommon("actions")}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibilityRows.map(({ product, visibility }) => {
                    const isHidden = visibility === "HIDDEN";
                    return (
                      <tr key={product.id} className="border-t border-border">
                        <td className="px-4 py-2 text-foreground">{product.nameEn}</td>
                        <td className="px-4 py-2">
                          <span
                            className={
                              "inline-block rounded-full px-2 py-0.5 text-xs font-medium " +
                              (isHidden
                                ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                                : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200")
                            }
                          >
                            {isHidden ? tVisibility("hiddenBadge") : tVisibility("visibleBadge")}
                          </span>
                        </td>
                        {canWriteVisibility && (
                          <td className="px-4 py-2">
                            <VisibilityToggleForm
                              action={setCustomerProductVisibilityAction.bind(
                                null,
                                id,
                                product.id,
                                isHidden ? null : "HIDDEN"
                              )}
                              isHidden={isHidden}
                              hideLabel={tVisibility("hideAction")}
                              unhideLabel={tVisibility("unhideAction")}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card accentBorder className="flex flex-col gap-4 p-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{tBuyerAccess("title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tBuyerAccess("intro")}</p>
          </div>

          {canInviteBuyer && <BuyerAccessForm action={inviteBuyerAction.bind(null, id)} />}

          {tradingRelationships.length === 0 ? (
            <p className="rounded-control border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {tBuyerAccess("empty")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-control border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium text-foreground">
                      {tBuyerAccess("columnBuyer")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium text-foreground">
                      {tBuyerAccess("columnStatus")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium text-foreground">
                      {tBuyerAccess("columnSent")}
                    </th>
                    {canInviteBuyer && (
                      <th scope="col" className="px-4 py-2 font-medium text-foreground">
                        {tCommon("actions")}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {tradingRelationships.map((relationship) => (
                    <tr key={relationship.id} className="border-t border-border">
                      <td className="px-4 py-2 text-foreground">
                        <div className="flex flex-col">
                          <span>{relationship.user.name}</span>
                          <span className="text-xs text-muted-foreground">{relationship.user.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${RELATIONSHIP_STATUS_STYLE[relationship.status]}`}
                        >
                          {tBuyerAccess(RELATIONSHIP_STATUS_KEY[relationship.status])}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-foreground">{relationship.createdAt.toLocaleDateString()}</td>
                      {canInviteBuyer && (
                        <td className="px-4 py-2 text-right">
                          {relationship.status === "ACTIVE" && (
                            <RevokeAccessButton
                              revokeAction={revokeBuyerAccessAction.bind(null, id, relationship.id)}
                            />
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
