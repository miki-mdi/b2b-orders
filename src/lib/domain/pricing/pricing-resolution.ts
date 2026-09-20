import { withTenantContext } from "@/lib/db/with-tenant";

export type PriceUnavailableReason =
  | "CUSTOMER_INACTIVE"
  | "PRODUCT_INACTIVE"
  | "PRODUCT_UNIT_INACTIVE"
  | "HIDDEN_FOR_CUSTOMER"
  | "NO_ASSIGNMENT"
  | "NO_PRICE";

export type PriceResolution =
  | {
      available: true;
      productUnitId: string;
      basePrice: number;
      discountPercent: number;
      finalPrice: number;
      currency: string;
    }
  | { available: false; reason: PriceUnavailableReason };

/**
 * Resolves the effective selling price for (customerId, productUnitId).
 * Will be reused by the Buyer catalog/order flow once that exists (Phase 1C+) -
 * this function only computes a value from ids the CALLER is responsible for
 * authorizing (a seller may ask about any of their customers; a future buyer
 * session would only ever pass its own customerId, enforced by that route's
 * auth guard, not by this function).
 *
 * Precedence rules, checked in this order (see docs/MVP_SCOPE.md and the
 * Phase 1B brief §7 for the locked resolution rule):
 *
 *   1. The customer must be active. Inactive -> unavailable, full stop.
 *   2. The Product and its ProductUnit must both be active. This is checked
 *      BEFORE visibility - an inactive product/unit is unavailable
 *      regardless of any visibility override that might otherwise show it.
 *   3. Visibility: a product is visible by default (no override needed).
 *      An explicit CustomerProductVisibility row of HIDDEN overrides that
 *      and makes it unavailable to this customer specifically. There is no
 *      explicit "VISIBLE" override needed for the default case - a VISIBLE
 *      row only matters as a no-op / future extension point, since absence
 *      of a row already means visible.
 *   4. The customer must have an active CustomerPriceListAssignment - no
 *      assignment (or an assignment pointing at a deactivated price list)
 *      means no price can be resolved.
 *   5. That price list must have a PriceListItem for this exact
 *      productUnitId - no fallback to "the product's other packaging" or
 *      any other price list.
 *   6. The customer's flat discountPercent (docs/MVP_SCOPE.md's locked
 *      discount rule) is applied AFTER the base price-list price:
 *      finalPrice = basePrice * (1 - discountPercent / 100), rounded to 2
 *      decimal places. No discount on file behaves as a 0% discount.
 *
 * Fails safe throughout: any missing link in this chain returns
 * `{ available: false, reason }` rather than throwing or guessing a price.
 */
export async function resolveEffectivePrice(
  tenantId: string,
  customerId: string,
  productUnitId: string
): Promise<PriceResolution> {
  return withTenantContext(tenantId, async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer || !customer.isActive) {
      return { available: false, reason: "CUSTOMER_INACTIVE" };
    }

    const productUnit = await tx.productUnit.findUnique({
      where: { id: productUnitId },
      include: { product: true },
    });
    if (!productUnit || !productUnit.isActive) {
      return { available: false, reason: "PRODUCT_UNIT_INACTIVE" };
    }
    if (!productUnit.product.isActive) {
      return { available: false, reason: "PRODUCT_INACTIVE" };
    }

    const visibilityOverride = await tx.customerProductVisibility.findUnique({
      where: { customerId_productId: { customerId, productId: productUnit.productId } },
    });
    if (visibilityOverride?.visibility === "HIDDEN") {
      return { available: false, reason: "HIDDEN_FOR_CUSTOMER" };
    }

    const assignment = await tx.customerPriceListAssignment.findUnique({ where: { customerId } });
    if (!assignment) {
      return { available: false, reason: "NO_ASSIGNMENT" };
    }

    const priceList = await tx.priceList.findUnique({ where: { id: assignment.priceListId } });
    if (!priceList || !priceList.isActive) {
      return { available: false, reason: "NO_ASSIGNMENT" };
    }

    const priceListItem = await tx.priceListItem.findUnique({
      where: { priceListId_productUnitId: { priceListId: assignment.priceListId, productUnitId } },
    });
    if (!priceListItem) {
      return { available: false, reason: "NO_PRICE" };
    }

    const basePrice = Number(priceListItem.price);
    const discountPercent = customer.discountPercent ? Number(customer.discountPercent) : 0;
    const finalPrice = Math.round(basePrice * (1 - discountPercent / 100) * 100) / 100;

    return {
      available: true,
      productUnitId,
      basePrice,
      discountPercent,
      finalPrice,
      currency: priceList.currency,
    };
  });
}
