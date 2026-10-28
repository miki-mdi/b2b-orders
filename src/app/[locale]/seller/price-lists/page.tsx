import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability, hasCapability } from "@/lib/auth/permissions";
import { listPriceLists } from "@/lib/domain/pricing/price-list-service";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/seller/status-badge";
import { ToggleActiveForm } from "@/components/seller/toggle-active-form";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { togglePriceListActiveAction } from "./actions";

export default async function PriceListsPage() {
  const session = await requireSellerSession();
  requireSellerCapability(session, "pricing:read");
  const canWrite = hasCapability(session.role, "pricing:write");
  const t = await getTranslations("seller.priceLists");
  const tCommon = await getTranslations("seller.common");
  const priceLists = await listPriceLists(session.tenantId);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("title")}
        action={
          canWrite ? (
            <Link href="/seller/price-lists/new" className={buttonStyles("primary")}>
              {tCommon("addNew")}
            </Link>
          ) : undefined
        }
      />

      {priceLists.length === 0 ? (
        <p className="rounded-control border border-dashed border-border p-8 text-center text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <Card accentBorder className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnName")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnCode")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnCurrency")}
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
              {priceLists.map((priceList) => (
                <tr key={priceList.id} className="border-t border-border">
                  <td className="px-4 py-2 text-foreground">
                    {priceList.name}
                    {priceList.isDefault && <span className="ml-2 text-xs text-muted-foreground">★</span>}
                  </td>
                  <td className="px-4 py-2 font-mono text-foreground">{priceList.code ?? "—"}</td>
                  <td className="px-4 py-2 text-foreground">{priceList.currency}</td>
                  <td className="px-4 py-2">
                    <StatusBadge isActive={priceList.isActive} activeLabel={tCommon("active")} inactiveLabel={tCommon("inactive")} />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/seller/price-lists/${priceList.id}/edit`}
                        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {canWrite ? tCommon("edit") : tCommon("view")}
                      </Link>
                      {canWrite && (
                        <ToggleActiveForm
                          action={togglePriceListActiveAction.bind(null, priceList.id, !priceList.isActive)}
                          isActive={priceList.isActive}
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
        </Card>
      )}
    </div>
  );
}
