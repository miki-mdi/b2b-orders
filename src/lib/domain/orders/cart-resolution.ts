import { withCustomerContext } from "@/lib/db/with-tenant";
import { resolveEffectivePrice, type PriceUnavailableReason } from "@/lib/domain/pricing/pricing-resolution";
import { round2 } from "./order-totals";

/**
 * The single place a cart line (productUnitId + quantity, the only two
 * things a buyer's browser is ever trusted to say) gets turned into
 * something safe to display or to charge. Called from THREE places that all
 * need the exact same answer: the cart page preview, the checkout preview,
 * and (again, authoritatively, right before writing an Order) submitOrder -
 * see docs/SECURITY_AND_MULTI_TENANCY.md's "never trust a client-supplied
 * price" rule and MVP_SCOPE.md's cart requirements.
 */
export type CartLineIssue =
  | "NOT_FOUND"
  | "INVALID_QUANTITY"
  | "BELOW_MIN_QTY"
  | "INVALID_INCREMENT"
  | PriceUnavailableReason;

export type ResolvedCartLine =
  | {
      ok: true;
      productUnitId: string;
      productId: string;
      productNameMk: string;
      productNameEn: string;
      productSku: string;
      unitSku: string;
      unitLabel: string;
      unitOfMeasureLabelMk: string;
      unitOfMeasureLabelEn: string;
      minOrderQty: number;
      orderIncrement: number;
      requestedQty: number;
      // basePrice/discountPercent are kept for the OrderLine snapshot
      // (submitOrder) - buyer-facing UI only ever renders unitPrice (the
      // already-discounted price) and the computed totals below, never the
      // price-list breakdown, per the "no internal pricing structures" rule.
      basePrice: number;
      discountPercent: number;
      unitPrice: number;
      vatRate: number;
      currency: string;
      lineSubtotal: number;
      lineVat: number;
      lineTotal: number;
    }
  | { ok: false; productUnitId: string; requestedQty: number; issue: CartLineIssue };

const QTY_TOLERANCE = 1e-6;

export async function resolveCartLine(
  tenantId: string,
  customerId: string,
  productUnitId: string,
  requestedQty: number
): Promise<ResolvedCartLine> {
  if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
    return { ok: false, productUnitId, requestedQty, issue: "INVALID_QUANTITY" };
  }

  const { productUnit, tenant } = await withCustomerContext(tenantId, customerId, async (tx) => ({
    productUnit: await tx.productUnit.findUnique({
      where: { id: productUnitId },
      include: { product: true, unitOfMeasure: true },
    }),
    tenant: await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
  }));

  if (!productUnit) {
    return { ok: false, productUnitId, requestedQty, issue: "NOT_FOUND" };
  }

  const minOrderQty = Number(productUnit.minOrderQty);
  const orderIncrement = Number(productUnit.orderIncrement);

  if (requestedQty < minOrderQty - QTY_TOLERANCE) {
    return { ok: false, productUnitId, requestedQty, issue: "BELOW_MIN_QTY" };
  }
  const steps = (requestedQty - minOrderQty) / orderIncrement;
  if (Math.abs(steps - Math.round(steps)) > QTY_TOLERANCE) {
    return { ok: false, productUnitId, requestedQty, issue: "INVALID_INCREMENT" };
  }

  // The one call in this whole flow that decides "is this item priced and
  // visible for this customer at all" - reused as-is per
  // src/lib/domain/pricing/pricing-resolution.ts's own docstring.
  const resolution = await resolveEffectivePrice(tenantId, customerId, productUnitId);
  if (!resolution.available) {
    return { ok: false, productUnitId, requestedQty, issue: resolution.reason };
  }

  const vatRate =
    productUnit.product.defaultVatRate != null ? Number(productUnit.product.defaultVatRate) : Number(tenant.defaultVatRate);
  const lineSubtotal = round2(resolution.finalPrice * requestedQty);
  const lineVat = round2(lineSubtotal * (vatRate / 100));

  return {
    ok: true,
    productUnitId,
    productId: productUnit.productId,
    productNameMk: productUnit.product.nameMk,
    productNameEn: productUnit.product.nameEn,
    productSku: productUnit.product.sku,
    unitSku: productUnit.sku,
    unitLabel: productUnit.label,
    unitOfMeasureLabelMk: productUnit.unitOfMeasure.labelMk,
    unitOfMeasureLabelEn: productUnit.unitOfMeasure.labelEn,
    minOrderQty,
    orderIncrement,
    requestedQty,
    basePrice: resolution.basePrice,
    discountPercent: resolution.discountPercent,
    unitPrice: resolution.finalPrice,
    vatRate,
    currency: resolution.currency,
    lineSubtotal,
    lineVat,
    lineTotal: round2(lineSubtotal + lineVat),
  };
}
