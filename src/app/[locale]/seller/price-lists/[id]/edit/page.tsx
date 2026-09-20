import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { getPriceList } from "@/lib/domain/pricing/price-list-service";
import { PriceListForm } from "../../price-list-form";
import { updatePriceListAction } from "../../actions";
import { deletePriceListItemAction } from "../items/actions";
import { DeleteItemForm } from "../items/delete-item-form";

export default async function EditPriceListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSellerSession();
  const t = await getTranslations("seller.priceLists");
  const tItems = await getTranslations("seller.priceListItems");
  const tCommon = await getTranslations("seller.common");

  const priceList = await getPriceList(session.tenantId, id);
  if (!priceList) {
    notFound();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div>
          <Link href="/seller/price-lists" className="text-sm underline underline-offset-2">
            {tCommon("backToList")}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{t("editTitle")}</h1>
        </div>
        <PriceListForm action={updatePriceListAction.bind(null, id)} priceList={priceList} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">{tItems("title")}</h2>
          <Link
            href={`/seller/price-lists/${id}/items/new`}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            {tCommon("addNew")}
          </Link>
        </div>

        {priceList.items.length === 0 ? (
          <p className="rounded border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
            {tItems("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tItems("columnProduct")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tItems("columnUnit")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tItems("columnPrice")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tCommon("actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {priceList.items.map((item) => (
                  <tr key={item.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-4 py-2">{item.productUnit.product.nameEn}</td>
                    <td className="px-4 py-2">
                      {item.productUnit.label} ({item.productUnit.unitOfMeasure.labelEn})
                    </td>
                    <td className="px-4 py-2">
                      {item.price.toString()} {priceList.currency}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/seller/price-lists/${id}/items/${item.id}/edit`}
                          className="text-sm underline underline-offset-2"
                        >
                          {tCommon("edit")}
                        </Link>
                        <DeleteItemForm
                          action={deletePriceListItemAction.bind(null, item.id)}
                          label={tItems("deleteAction")}
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
    </div>
  );
}
