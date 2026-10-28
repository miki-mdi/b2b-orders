import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability, hasCapability } from "@/lib/auth/permissions";
import { getProduct } from "@/lib/domain/catalog/product-service";
import { listCategories } from "@/lib/domain/catalog/category-service";
import { StatusBadge } from "@/components/seller/status-badge";
import { ToggleActiveForm } from "@/components/seller/toggle-active-form";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { ProductForm } from "../../product-form";
import { updateProductAction } from "../../actions";
import { toggleProductUnitActiveAction } from "../units/actions";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSellerSession();
  requireSellerCapability(session, "catalog:read");
  const canWrite = hasCapability(session.role, "catalog:write");
  const t = await getTranslations("seller.products");
  const tUnits = await getTranslations("seller.productUnits");
  const tCommon = await getTranslations("seller.common");

  const product = await getProduct(session.tenantId, id);
  if (!product) {
    notFound();
  }
  const categories = await listCategories(session.tenantId);
  // ProductForm is a Client Component - pass only its own editable fields,
  // never the full getProduct() result (its `units` relation carries Prisma
  // Decimal values, which aren't a plain object RSC can send across the
  // server/client boundary).
  const productFormValues = {
    nameMk: product.nameMk,
    nameEn: product.nameEn,
    sku: product.sku,
    categoryId: product.categoryId,
    barcode: product.barcode,
    defaultVatRate: product.defaultVatRate?.toString() ?? null,
    description: product.description,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-2">
          <Link href="/seller/products" className={buttonStyles("ghost")}>
            {tCommon("backToList")}
          </Link>
          <PageHeader title={canWrite ? t("editTitle") : t("viewTitle")} />
        </div>
        <Card accentBorder className="max-w-xl p-6 lg:max-w-4xl">
          <ProductForm action={updateProductAction.bind(null, id)} product={productFormValues} categories={categories} readOnly={!canWrite} />
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-foreground">{tUnits("title")}</h2>
          {canWrite && (
            <Link href={`/seller/products/${id}/units/new`} className={buttonStyles("primary")}>
              {tCommon("addNew")}
            </Link>
          )}
        </div>

        {product.units.length === 0 ? (
          <p className="rounded-control border border-dashed border-border p-8 text-center text-muted-foreground">
            {tUnits("empty")}
          </p>
        ) : (
          <Card accentBorder className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium text-foreground">
                    {tUnits("columnLabel")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium text-foreground">
                    {tUnits("columnSku")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium text-foreground">
                    {tUnits("columnUnit")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium text-foreground">
                    {tUnits("columnMinQty")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium text-foreground">
                    {tUnits("columnIncrement")}
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
                {product.units.map((unit) => (
                  <tr key={unit.id} className="border-t border-border">
                    <td className="px-4 py-2 text-foreground">
                      {unit.label}
                      {unit.isDefault && <span className="ml-2 text-xs text-muted-foreground">★</span>}
                    </td>
                    <td className="px-4 py-2 font-mono text-foreground">{unit.sku}</td>
                    <td className="px-4 py-2 text-foreground">{unit.unitOfMeasure.labelEn}</td>
                    <td className="px-4 py-2 text-foreground">{unit.minOrderQty.toString()}</td>
                    <td className="px-4 py-2 text-foreground">{unit.orderIncrement.toString()}</td>
                    <td className="px-4 py-2">
                      <StatusBadge isActive={unit.isActive} activeLabel={tCommon("active")} inactiveLabel={tCommon("inactive")} />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/seller/products/${id}/units/${unit.id}/edit`}
                          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {canWrite ? tCommon("edit") : tCommon("view")}
                        </Link>
                        {canWrite && (
                          <ToggleActiveForm
                            action={toggleProductUnitActiveAction.bind(null, unit.id, !unit.isActive)}
                            isActive={unit.isActive}
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
    </div>
  );
}
