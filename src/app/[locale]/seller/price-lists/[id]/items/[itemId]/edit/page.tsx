import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { getPriceListItem } from "@/lib/domain/pricing/price-list-item-service";
import { PriceListItemForm } from "../../price-list-item-form";
import { updatePriceListItemAction } from "../../actions";

export default async function EditPriceListItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id: priceListId, itemId } = await params;
  const session = await requireSellerSession();
  const t = await getTranslations("seller.priceListItems");
  const tCommon = await getTranslations("seller.common");

  const item = await getPriceListItem(session.tenantId, itemId);
  if (!item || item.priceListId !== priceListId) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/seller/price-lists/${priceListId}/edit`} className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("editTitle")}</h1>
      </div>
      <PriceListItemForm
        action={updatePriceListItemAction.bind(null, priceListId, itemId)}
        existingPrice={item.price.toString()}
        existingProductUnitLabel={`${item.productUnit.product.nameEn} - ${item.productUnit.label} (${item.productUnit.unitOfMeasure.labelEn})`}
      />
    </div>
  );
}
