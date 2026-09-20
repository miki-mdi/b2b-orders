import { getLocale, getTranslations } from "next-intl/server";
import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { listBuyerCatalog, listBuyerCategories } from "@/lib/domain/catalog/buyer-catalog-service";
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
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

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
          className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        />
        <label className="sr-only" htmlFor="catalog-category">
          {t("categoryAll")}
        </label>
        <select
          id="catalog-category"
          name="category"
          defaultValue={category ?? ""}
          className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          <option value="">{t("categoryAll")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {locale === "mk" ? c.nameMk : c.nameEn}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          {t("search")}
        </button>
      </form>

      {items.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
          {t("empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.productUnitId}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="font-medium">{locale === "mk" ? item.nameMk : item.nameEn}</div>
              <div className="text-xs text-zinc-500">
                {t("sku")}: {item.sku} / {item.unitSku}
              </div>
              <div className="text-xs text-zinc-500">
                {item.unitLabel} · {locale === "mk" ? item.unitOfMeasureLabelMk : item.unitOfMeasureLabelEn}
              </div>
              <div className="mt-1 text-lg font-semibold">
                {item.price.toFixed(2)} {item.currency}
              </div>
              <div className="text-xs text-zinc-500">{t("vatNote", { rate: item.vatRate })}</div>
              <div className="text-xs text-zinc-500">
                {t("minQtyNote", { min: item.minOrderQty, increment: item.orderIncrement })}
              </div>
              <AddToCartControl
                productUnitId={item.productUnitId}
                minOrderQty={item.minOrderQty}
                orderIncrement={item.orderIncrement}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
