import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { getProduct } from "@/lib/domain/catalog/product-service";
import { listCategories } from "@/lib/domain/catalog/category-service";
import { StatusBadge } from "@/components/seller/status-badge";
import { ToggleActiveForm } from "@/components/seller/toggle-active-form";
import { ProductForm } from "../../product-form";
import { updateProductAction } from "../../actions";
import { toggleProductUnitActiveAction } from "../units/actions";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSellerSession();
  const t = await getTranslations("seller.products");
  const tUnits = await getTranslations("seller.productUnits");
  const tCommon = await getTranslations("seller.common");

  const product = await getProduct(session.tenantId, id);
  if (!product) {
    notFound();
  }
  const categories = await listCategories(session.tenantId);

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div>
          <Link href="/seller/products" className="text-sm underline underline-offset-2">
            {tCommon("backToList")}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{t("editTitle")}</h1>
        </div>
        <ProductForm action={updateProductAction.bind(null, id)} product={product} categories={categories} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">{tUnits("title")}</h2>
          <Link
            href={`/seller/products/${id}/units/new`}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            {tCommon("addNew")}
          </Link>
        </div>

        {product.units.length === 0 ? (
          <p className="rounded border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
            {tUnits("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tUnits("columnLabel")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tUnits("columnSku")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tUnits("columnUnit")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tUnits("columnMinQty")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {tUnits("columnIncrement")}
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
                {product.units.map((unit) => (
                  <tr key={unit.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-4 py-2">
                      {unit.label}
                      {unit.isDefault && <span className="ml-2 text-xs text-zinc-500">★</span>}
                    </td>
                    <td className="px-4 py-2 font-mono">{unit.sku}</td>
                    <td className="px-4 py-2">{unit.unitOfMeasure.labelEn}</td>
                    <td className="px-4 py-2">{unit.minOrderQty.toString()}</td>
                    <td className="px-4 py-2">{unit.orderIncrement.toString()}</td>
                    <td className="px-4 py-2">
                      <StatusBadge isActive={unit.isActive} activeLabel={tCommon("active")} inactiveLabel={tCommon("inactive")} />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <Link href={`/seller/products/${id}/units/${unit.id}/edit`} className="text-sm underline underline-offset-2">
                          {tCommon("edit")}
                        </Link>
                        <ToggleActiveForm
                          action={toggleProductUnitActiveAction.bind(null, unit.id, !unit.isActive)}
                          isActive={unit.isActive}
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
      </div>
    </div>
  );
}
