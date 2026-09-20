import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability, hasCapability } from "@/lib/auth/permissions";
import { listCategories } from "@/lib/domain/catalog/category-service";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/seller/status-badge";
import { ToggleActiveForm } from "@/components/seller/toggle-active-form";
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {canWrite && (
          <Link
            href="/seller/categories/new"
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            {tCommon("addNew")}
          </Link>
        )}
      </div>

      {categories.length === 0 ? (
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
                  {t("columnSortOrder")}
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
              {categories.map((category) => (
                <tr key={category.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-4 py-2">
                    <div>{category.nameEn}</div>
                    <div className="text-xs text-zinc-500">{category.nameMk}</div>
                  </td>
                  <td className="px-4 py-2">{category.sortOrder}</td>
                  <td className="px-4 py-2">
                    <StatusBadge
                      isActive={category.isActive}
                      activeLabel={tCommon("active")}
                      inactiveLabel={tCommon("inactive")}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <Link href={`/seller/categories/${category.id}/edit`} className="text-sm underline underline-offset-2">
                        {canWrite ? tCommon("edit") : tCommon("view")}
                      </Link>
                      {canWrite && (
                        <ToggleActiveForm
                          action={toggleCategoryActiveAction.bind(null, category.id, !category.isActive)}
                          isActive={category.isActive}
                          deactivateLabel={tCommon("deactivate")}
                          reactivateLabel={tCommon("reactivate")}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
