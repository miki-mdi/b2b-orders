import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability, hasCapability } from "@/lib/auth/permissions";
import { getCategory } from "@/lib/domain/catalog/category-service";
import { CategoryForm } from "../../category-form";
import { updateCategoryAction } from "../../actions";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSellerSession();
  requireSellerCapability(session, "catalog:read");
  const readOnly = !hasCapability(session.role, "catalog:write");
  const t = await getTranslations("seller.categories");
  const tCommon = await getTranslations("seller.common");

  // getCategory is tenant-scoped (withTenantContext) - a category belonging
  // to another tenant, or a nonexistent id, both come back as null here,
  // and both correctly become a 404 rather than leaking which case it was.
  const category = await getCategory(session.tenantId, id);
  if (!category) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/seller/categories" className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{readOnly ? t("viewTitle") : t("editTitle")}</h1>
      </div>
      <CategoryForm action={updateCategoryAction.bind(null, id)} category={category} readOnly={readOnly} />
    </div>
  );
}
