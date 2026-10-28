import { getLocale, getTranslations } from "next-intl/server";
import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { listBuyerCatalog, listBuyerCategories } from "@/lib/domain/catalog/buyer-catalog-service";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/form-field";
import { AddToCartControl } from "./add-to-cart-control";

export default async function BuyerCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const session = await requireBuyerSession();
  const { category, q } = await searchParams;
  const t = await getTranslations("buyer.catalog");
  const locale = await getLocale();

  const [items, categories] = await Promise.all([
    listBuyerCatalog(session.tenantId, session.customerId, {
      categoryId: category || undefined,
      search: q || undefined,
    }),
    listBuyerCategories(session.tenantId, session.customerId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} />

      <Card accentBorder className="p-3">
        <form method="GET" className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="catalog-search">
            {t("searchPlaceholder")}
          </label>
          <input
            id="catalog-search"
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder={t("searchPlaceholder")}
            className={`flex-1 ${inputStyles}`}
          />
          <label className="sr-only" htmlFor="catalog-category">
            {t("categoryAll")}
          </label>
          <select
            id="catalog-category"
            name="category"
            defaultValue={category ?? ""}
            className={`${inputStyles} sm:w-auto`}
          >
            <option value="">{t("categoryAll")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {locale === "mk" ? c.nameMk : c.nameEn}
              </option>
            ))}
          </select>
          <Button type="submit">{t("search")}</Button>
        </form>
      </Card>

      {items.length === 0 ? (
        <p className="rounded-control border border-dashed border-border p-8 text-center text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.productUnitId} accentBorder className="flex flex-col gap-2 p-4">
              <div className="font-medium text-foreground">{locale === "mk" ? item.nameMk : item.nameEn}</div>
              <div className="text-xs text-muted-foreground">
                {t("sku")}: {item.sku} / {item.unitSku}
              </div>
              <div className="text-xs text-muted-foreground">
                {item.unitLabel} · {locale === "mk" ? item.unitOfMeasureLabelMk : item.unitOfMeasureLabelEn}
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {item.price.toFixed(2)} {item.currency}
              </div>
              <div className="text-xs text-muted-foreground">{t("vatNote", { rate: item.vatRate })}</div>
              <div className="text-xs text-muted-foreground">
                {t("minQtyNote", { min: item.minOrderQty, increment: item.orderIncrement })}
              </div>
              <AddToCartControl
                productUnitId={item.productUnitId}
                minOrderQty={item.minOrderQty}
                orderIncrement={item.orderIncrement}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
