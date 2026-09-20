import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability } from "@/lib/auth/permissions";
import { getPriceList } from "@/lib/domain/pricing/price-list-service";
import { listAllProductUnits } from "@/lib/domain/catalog/product-unit-service";
import { PriceListItemForm } from "../price-list-item-form";
import { createPriceListItemAction } from "../actions";

export default async function NewPriceListItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: priceListId } = await params;
  const session = await requireSellerSession();
  requireSellerCapability(session, "pricing:write");
  const t = await getTranslations("seller.priceListItems");
  const tCommon = await getTranslations("seller.common");

  const priceList = await getPriceList(session.tenantId, priceListId);
  if (!priceList) {
    notFound();
  }
  const productUnits = await listAllProductUnits(session.tenantId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/seller/price-lists/${priceListId}/edit`} className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("newTitle")}</h1>
        <p className="text-sm text-zinc-500">{priceList.name}</p>
      </div>
      {productUnits.length === 0 && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {t("noProductUnitsWarning")}
        </p>
      )}
      <PriceListItemForm action={createPriceListItemAction.bind(null, priceListId)} productUnits={productUnits} />
    </div>
  );
}
