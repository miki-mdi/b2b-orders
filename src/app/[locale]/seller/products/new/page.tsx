import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability } from "@/lib/auth/permissions";
import { listCategories } from "@/lib/domain/catalog/category-service";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { ProductForm } from "../product-form";
import { createProductAction } from "../actions";

export default async function NewProductPage() {
  const session = await requireSellerSession();
  requireSellerCapability(session, "catalog:write");
  const t = await getTranslations("seller.products");
  const tCommon = await getTranslations("seller.common");
  const categories = (await listCategories(session.tenantId)).filter((c) => c.isActive);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-2">
        <Link href="/seller/products" className={buttonStyles("ghost")}>
          {tCommon("backToList")}
        </Link>
        <PageHeader title={t("newTitle")} />
      </div>
      <Card accentBorder className="max-w-xl p-6 lg:max-w-4xl">
        <ProductForm action={createProductAction} categories={categories} />
      </Card>
    </div>
  );
}
