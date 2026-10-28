import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability, hasCapability } from "@/lib/auth/permissions";
import { listProductsPage } from "@/lib/domain/catalog/product-service";
import { clampPage } from "@/lib/pagination";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/seller/status-badge";
import { ToggleActiveForm } from "@/components/seller/toggle-active-form";
import { Pagination } from "@/components/seller/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { toggleProductActiveAction } from "./actions";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requireSellerSession();
  requireSellerCapability(session, "catalog:read");
  const canWrite = hasCapability(session.role, "catalog:write");
  const { page: pageParam } = await searchParams;
  const t = await getTranslations("seller.products");
  const tCommon = await getTranslations("seller.common");
  const page = clampPage(pageParam);
  const result = await listProductsPage(session.tenantId, page);
  const products = result.items;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("title")}
        action={
          canWrite ? (
            <Link href="/seller/products/new" className={buttonStyles("primary")}>
              {tCommon("addNew")}
            </Link>
          ) : undefined
        }
      />

      {products.length === 0 ? (
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
                  {t("columnSku")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnCategory")}
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
              {products.map((product) => (
                <tr key={product.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <div className="text-foreground">{product.nameEn}</div>
                    <div className="text-xs text-muted-foreground">{product.nameMk}</div>
                  </td>
                  <td className="px-4 py-2 font-mono text-foreground">{product.sku}</td>
                  <td className="px-4 py-2 text-foreground">{product.category?.nameEn ?? "—"}</td>
                  <td className="px-4 py-2">
                    <StatusBadge isActive={product.isActive} activeLabel={tCommon("active")} inactiveLabel={tCommon("inactive")} />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/seller/products/${product.id}/edit`}
                        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {canWrite ? tCommon("edit") : tCommon("view")}
                      </Link>
                      {canWrite && (
                        <ToggleActiveForm
                          action={toggleProductActiveAction.bind(null, product.id, !product.isActive)}
                          isActive={product.isActive}
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
