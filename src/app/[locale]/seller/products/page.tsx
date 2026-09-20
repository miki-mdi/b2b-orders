import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { listProductsPage } from "@/lib/domain/catalog/product-service";
import { clampPage } from "@/lib/pagination";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/seller/status-badge";
import { ToggleActiveForm } from "@/components/seller/toggle-active-form";
import { Pagination } from "@/components/seller/pagination";
import { toggleProductActiveAction } from "./actions";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requireSellerSession();
  const { page: pageParam } = await searchParams;
  const t = await getTranslations("seller.products");
  const tCommon = await getTranslations("seller.common");
  const page = clampPage(pageParam);
  const result = await listProductsPage(session.tenantId, page);
  const products = result.items;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Link
          href="/seller/products/new"
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          {tCommon("addNew")}
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnName")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnSku")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnCategory")}
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
              {products.map((product) => (
                <tr key={product.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-4 py-2">
                    <div>{product.nameEn}</div>
                    <div className="text-xs text-zinc-500">{product.nameMk}</div>
                  </td>
                  <td className="px-4 py-2 font-mono">{product.sku}</td>
                  <td className="px-4 py-2">{product.category?.nameEn ?? "—"}</td>
                  <td className="px-4 py-2">
                    <StatusBadge isActive={product.isActive} activeLabel={tCommon("active")} inactiveLabel={tCommon("inactive")} />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <Link href={`/seller/products/${product.id}/edit`} className="text-sm underline underline-offset-2">
                        {tCommon("edit")}
                      </Link>
                      <ToggleActiveForm
                        action={toggleProductActiveAction.bind(null, product.id, !product.isActive)}
                        isActive={product.isActive}
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

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        buildHref={(targetPage) => (targetPage > 1 ? `/seller/products?page=${targetPage}` : "/seller/products")}
        previousLabel={tCommon("previous")}
        nextLabel={tCommon("next")}
        summaryLabel={tCommon("pageSummary", { page: result.page, totalPages: result.totalPages, total: result.total })}
      />
    </div>
  );
}
