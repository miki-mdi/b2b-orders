import { withCustomerContext } from "@/lib/db/with-tenant";
import { resolveEffectivePrice } from "@/lib/domain/pricing/pricing-resolution";

/**
 * Read-only buyer-facing catalog. Always goes through withCustomerContext
 * (never withTenantContext, which is the seller-only entry point) so both
 * RLS tiers apply the same way every other buyer-facing query does - see
 * docs/SECURITY_AND_MULTI_TENANCY.md §3.
 *
 * Availability (active product/unit, visibility, priced) is decided
 * entirely by resolveEffectivePrice - an item with no resolvable price for
 * this customer is silently excluded here rather than shown as
 * unavailable, per the Phase 1C brief ("hides items that have no valid
 * effective price or are otherwise unavailable").
 */
export type BuyerCatalogFilter = { categoryId?: string; search?: string };

export type BuyerCatalogItem = {
  productId: string;
  productUnitId: string;
  nameMk: string;
  nameEn: string;
  sku: string;
  unitSku: string;
  unitLabel: string;
  unitOfMeasureLabelMk: string;
  unitOfMeasureLabelEn: string;
  categoryId: string | null;
  minOrderQty: number;
  orderIncrement: number;
  price: number;
  currency: string;
  vatRate: number;
};

export function listBuyerCategories(tenantId: string, customerId: string) {
  return withCustomerContext(tenantId, customerId, (tx) =>
    tx.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] })
  );
}

export async function listBuyerCatalog(
  tenantId: string,
  customerId: string,
  filter: BuyerCatalogFilter
): Promise<BuyerCatalogItem[]> {
  const search = filter.search?.trim();

  const { productUnits, tenantDefaultVatRate } = await withCustomerContext(tenantId, customerId, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const productUnits = await tx.productUnit.findMany({
      where: {
        isActive: true,
        product: {
          isActive: true,
          ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        },
        ...(search
          ? {
              OR: [
                { sku: { contains: search, mode: "insensitive" as const } },
                { barcode: { contains: search, mode: "insensitive" as const } },
                { product: { nameMk: { contains: search, mode: "insensitive" as const } } },
                { product: { nameEn: { contains: search, mode: "insensitive" as const } } },
                { product: { sku: { contains: search, mode: "insensitive" as const } } },
                { product: { barcode: { contains: search, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      include: { product: true, unitOfMeasure: true },
      orderBy: [{ product: { nameEn: "asc" } }, { label: "asc" }],
    });
    return { productUnits, tenantDefaultVatRate: Number(tenant.defaultVatRate) };
  });

  const resolved = await Promise.all(
    productUnits.map(async (productUnit): Promise<BuyerCatalogItem | null> => {
      const resolution = await resolveEffectivePrice(tenantId, customerId, productUnit.id);
      if (!resolution.available) return null;

      return {
        productId: productUnit.productId,
        productUnitId: productUnit.id,
        nameMk: productUnit.product.nameMk,
        nameEn: productUnit.product.nameEn,
        sku: productUnit.product.sku,
        unitSku: productUnit.sku,
        unitLabel: productUnit.label,
        unitOfMeasureLabelMk: productUnit.unitOfMeasure.labelMk,
        unitOfMeasureLabelEn: productUnit.unitOfMeasure.labelEn,
        categoryId: productUnit.product.categoryId,
        minOrderQty: Number(productUnit.minOrderQty),
        orderIncrement: Number(productUnit.orderIncrement),
        price: resolution.finalPrice,
        currency: resolution.currency,
        vatRate: productUnit.product.defaultVatRate != null ? Number(productUnit.product.defaultVatRate) : tenantDefaultVatRate,
      };
    })
  );

  return resolved.filter((item): item is BuyerCatalogItem => item !== null);
}
