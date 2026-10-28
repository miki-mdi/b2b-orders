import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability, hasCapability } from "@/lib/auth/permissions";
import { getPriceList } from "@/lib/domain/pricing/price-list-service";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { PriceListForm } from "../../price-list-form";
import { updatePriceListAction } from "../../actions";
import { deletePriceListItemAction } from "../items/actions";
import { DeleteItemForm } from "../items/delete-item-form";

export default async function EditPriceListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSellerSession();
  requireSellerCapability(session, "pricing:read");
  const canWrite = hasCapability(session.role, "pricing:write");
  const t = await getTranslations("seller.priceLists");
  const tItems = await getTranslations("seller.priceListItems");
  const tCommon = await getTranslations("seller.common");

  const priceList = await getPriceList(session.tenantId, id);
  if (!priceList) {
    notFound();
  }
  // PriceListForm is a Client Component - pass only its own editable fields,
  // never the full getPriceList() result (its items/productUnit/product
  // carry Prisma Decimal values, which aren't a plain object RSC can send
  // across the server/client boundary).
  const priceListFormValues = {
    name: priceList.name,
    code: priceList.code,
    description: priceList.description,
    currency: priceList.currency,
    isDefault: priceList.isDefault,
    isActive: priceList.isActive,
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-2">
          <Link href="/seller/price-lists" className={buttonStyles("ghost")}>
            {tCommon("backToList")}
          </Link>
          <PageHeader title={canWrite ? t("editTitle") : t("viewTitle")} />
        </div>
        <Card accentBorder className="max-w-4xl p-6">
          <PriceListForm action={updatePriceListAction.bind(null, id)} priceList={priceListFormValues} readOnly={!canWrite} />
        </Card>
      </div>

      <Card accentBorder className="flex max-w-4xl flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">{tItems("title")}</h2>
          {canWrite && (
            <Link href={`/seller/price-lists/${id}/items/new`} className={buttonStyles("primary")}>
              {tCommon("addNew")}
            </Link>
          )}
        </div>

        {priceList.items.length === 0 ? (
          <p className="rounded-control border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {tItems("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-control border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium text-foreground">
                    {tItems("columnProduct")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium text-foreground">
                    {tItems("columnUnit")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium text-foreground">
                    {tItems("columnPrice")}
                  </th>
                  {canWrite && (
                    <th scope="col" className="px-4 py-2 font-medium text-foreground">
                      {tCommon("actions")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {priceList.items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-4 py-2 text-foreground">{item.productUnit.product.nameEn}</td>
                    <td className="px-4 py-2 text-foreground">
                      {item.productUnit.label} ({item.productUnit.unitOfMeasure.labelEn})
                    </td>
                    <td className="px-4 py-2 text-foreground">
                      {item.price.toString()} {priceList.currency}
                    </td>
                    {canWrite && (
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/seller/price-lists/${id}/items/${item.id}/edit`}
                            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {tCommon("edit")}
                          </Link>
                          <DeleteItemForm
                            action={deletePriceListItemAction.bind(null, item.id)}
                            label={tItems("deleteAction")}
                          />
                        </div>
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
  );
}
