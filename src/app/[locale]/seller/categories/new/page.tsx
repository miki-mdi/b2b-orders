import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CategoryForm } from "../category-form";
import { createCategoryAction } from "../actions";

export default async function NewCategoryPage() {
  const t = await getTranslations("seller.categories");
  const tCommon = await getTranslations("seller.common");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/seller/categories" className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("newTitle")}</h1>
      </div>
      <CategoryForm action={createCategoryAction} />
    </div>
  );
}
