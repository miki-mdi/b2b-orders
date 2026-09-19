import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { getProductUnit } from "@/lib/domain/catalog/product-unit-service";
import { listUnitsOfMeasure } from "@/lib/domain/catalog/unit-of-measure-service";
import { ProductUnitForm } from "../../product-unit-form";
import { updateProductUnitAction } from "../../actions";

export default async function EditProductUnitPage({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}) {
  const { id: productId, unitId } = await params;
  const session = await requireSellerSession();
  const t = await getTranslations("seller.productUnits");
  const tCommon = await getTranslations("seller.common");

  const productUnit = await getProductUnit(session.tenantId, unitId);
  if (!productUnit || productUnit.productId !== productId) {
    notFound();
  }
  const units = await listUnitsOfMeasure(session.tenantId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/seller/products/${productId}/edit`} className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("editTitle")}</h1>
      </div>
      <ProductUnitForm
        action={updateProductUnitAction.bind(null, productId, unitId)}
        productUnit={productUnit}
        units={units}
      />
    </div>
  );
}
