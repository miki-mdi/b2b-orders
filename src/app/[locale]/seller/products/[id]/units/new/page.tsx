import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability } from "@/lib/auth/permissions";
import { getProduct } from "@/lib/domain/catalog/product-service";
import { listUnitsOfMeasure } from "@/lib/domain/catalog/unit-of-measure-service";
import { ProductUnitForm } from "../product-unit-form";
import { createProductUnitAction } from "../actions";

export default async function NewProductUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: productId } = await params;
  const session = await requireSellerSession();
  requireSellerCapability(session, "catalog:write");
  const t = await getTranslations("seller.productUnits");
  const tCommon = await getTranslations("seller.common");

  const product = await getProduct(session.tenantId, productId);
  if (!product) {
    notFound();
  }
  const units = (await listUnitsOfMeasure(session.tenantId)).filter((u) => u.isActive);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/seller/products/${productId}/edit`} className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("newTitle")}</h1>
        <p className="text-sm text-zinc-500">{product.nameEn}</p>
      </div>
      <ProductUnitForm action={createProductUnitAction.bind(null, productId)} units={units} />
    </div>
  );
}
