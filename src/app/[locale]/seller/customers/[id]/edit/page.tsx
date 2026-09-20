import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { getCustomer } from "@/lib/domain/customers/customer-service";
import { listPriceLists } from "@/lib/domain/pricing/price-list-service";
import { listCustomerProductVisibility } from "@/lib/domain/customers/customer-product-visibility-service";
import { StatusBadge } from "@/components/seller/status-badge";
import { ToggleActiveForm } from "@/components/seller/toggle-active-form";
import { CustomerForm } from "../../customer-form";
import { updateCustomerAction } from "../../actions";
import { toggleCustomerAddressActiveAction } from "../addresses/actions";
import { updateCustomerAssignmentAction, updateCustomerDiscountAction } from "../pricing/actions";
import { PricingSection } from "../pricing/pricing-section";
import { setCustomerProductVisibilityAction } from "../visibility/actions";
import { VisibilityToggleForm } from "../visibility/visibility-toggle-form";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSellerSession();
  const t = await getTranslations("seller.customers");
  const tAddresses = await getTranslations("seller.addresses");
  const tPricing = await getTranslations("seller.pricing");
  const tVisibility = await getTranslations("seller.visibility");
  const tCommon = await getTranslations("seller.common");

  const customer = await getCustomer(session.tenantId, id);
  if (!customer) {
    notFound();
  }
  const priceLists = await listPriceLists(session.tenantId);
  const visibilityRows = await listCustomerProductVisibility(session.tenantId, id);

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div>
          <Link href="/seller/customers" className="text-sm underline underline-offset-2">
            {tCommon("backToList")}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{t("editTitle")}</h1>
        </div>
        <CustomerForm action={updateCustomerAction.bind(null, id)} customer={customer} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">{tAddresses("title")}</h2>
          <Link
            href={`/seller/customers/${id}/addresses/new`}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            {tCommon("addNew")}
          </Link>
        </div>

        {customer.addresses.length === 0 ? (
          <p className="rounded border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
            {tAddresses("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tAddresses("columnLabel")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tAddresses("columnCity")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tAddresses("columnDefault")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tCommon("status")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tCommon("actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {customer.addresses.map((address) => (
                  <tr key={address.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-4 py-2">{address.label}</td>
                    <td className="px-4 py-2">{address.city}</td>
                    <td className="px-4 py-2">{address.isDefaultDelivery ? "★" : ""}</td>
                    <td className="px-4 py-2">
                      <StatusBadge isActive={address.isActive} activeLabel={tCommon("active")} inactiveLabel={tCommon("inactive")} />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/seller/customers/${id}/addresses/${address.id}/edit`}
                          className="text-sm underline underline-offset-2"
                        >
                          {tCommon("edit")}
                        </Link>
                        <ToggleActiveForm
                          action={toggleCustomerAddressActiveAction.bind(null, address.id, !address.isActive)}
                          isActive={address.isActive}
                          deactivateLabel={tCommon("deactivate")}
                          reactivateLabel={tCommon("reactivate")}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{tPricing("title")}</h2>
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
        />
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{tVisibility("title")}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{tVisibility("intro")}</p>

        {visibilityRows.length === 0 ? (
          <p className="rounded border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
            {tVisibility("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tVisibility("columnProduct")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tVisibility("columnStatus")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tCommon("actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibilityRows.map(({ product, visibility }) => {
                  const isHidden = visibility === "HIDDEN";
                  return (
                    <tr key={product.id} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-4 py-2">{product.nameEn}</td>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
