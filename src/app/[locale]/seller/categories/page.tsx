import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability, hasCapability } from "@/lib/auth/permissions";
import { listCategories } from "@/lib/domain/catalog/category-service";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/seller/status-badge";
import { ToggleActiveForm } from "@/components/seller/toggle-active-form";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { toggleCategoryActiveAction } from "./actions";

export default async function CategoriesPage() {
  const session = await requireSellerSession();
  requireSellerCapability(session, "catalog:read");
  const canWrite = hasCapability(session.role, "catalog:write");
  const t = await getTranslations("seller.categories");
  const tCommon = await getTranslations("seller.common");
  const categories = await listCategories(session.tenantId);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("title")}
        action={
          canWrite ? (
            <Link href="/seller/categories/new" className={buttonStyles("primary")}>
              {tCommon("addNew")}
            </Link>
          ) : undefined
        }
      />

      {categories.length === 0 ? (
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
                  {t("columnSortOrder")}
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
              {categories.map((category) => (
                <tr key={category.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <div className="text-foreground">{category.nameEn}</div>
                    <div className="text-xs text-muted-foreground">{category.nameMk}</div>
                  </td>
                  <td className="px-4 py-2 text-foreground">{category.sortOrder}</td>
                  <td className="px-4 py-2">
                    <StatusBadge
                      isActive={category.isActive}
                      activeLabel={tCommon("active")}
                      inactiveLabel={tCommon("inactive")}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/seller/categories/${category.id}/edit`}
                        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {canWrite ? tCommon("edit") : tCommon("view")}
                      </Link>
                      {canWrite && (
                        <ToggleActiveForm
                          action={toggleCategoryActiveAction.bind(null, category.id, !category.isActive)}
                          isActive={category.isActive}
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
