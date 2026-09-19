import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { listCategories } from "@/lib/domain/catalog/category-service";
import { ProductForm } from "../product-form";
import { createProductAction } from "../actions";

export default async function NewProductPage() {
  const session = await requireSellerSession();
  const t = await getTranslations("seller.products");
  const tCommon = await getTranslations("seller.common");
  const categories = (await listCategories(session.tenantId)).filter((c) => c.isActive);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/seller/products" className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("newTitle")}</h1>
      </div>
      <ProductForm action={createProductAction} categories={categories} />
    </div>
  );
}
