import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { resolveCartLine } from "@/lib/domain/orders/cart-resolution";
import { createProduct } from "@/lib/domain/catalog/product-service";
import { createProductUnit } from "@/lib/domain/catalog/product-unit-service";
import { createPriceListItem } from "@/lib/domain/pricing/price-list-item-service";
import { setCustomerProductVisibility } from "@/lib/domain/customers/customer-product-visibility-service";

describe("resolveCartLine", () => {
  let tenant: SeededTenant;
  let actorUserId: string;
  let customerId: string;
  let priceListId: string;
  let unitOfMeasureId: string;
  let categoryId: string;
  let steppedProductUnitId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Iota", "iota-cart", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
    customerId = tenant.customers[0].id;

    const seededFixture = await withTenantContext(tenant.tenantId, (tx) =>
      tx.productUnit.findFirstOrThrow({ include: { product: true } })
    );
    categoryId = seededFixture.product.categoryId!;
    unitOfMeasureId = seededFixture.unitOfMeasureId;

    const priceList = await withTenantContext(tenant.tenantId, (tx) => tx.priceList.findFirstOrThrow({}));
    priceListId = priceList.id;

    const product = await createProduct(tenant.tenantId, actorUserId, {
      nameMk: "Со чекор",
      nameEn: "Stepped Product",
      sku: "STEPPED-1",
      categoryId,
      isActive: true,
    });
    const productUnit = await createProductUnit(tenant.tenantId, actorUserId, product.id, {
      unitOfMeasureId,
      sku: "STEPPED-1-BOX",
      label: "Box of 5",
      minOrderQty: 5,
      orderIncrement: 5,
      isDefault: true,
      isActive: true,
    });
    steppedProductUnitId = productUnit.id;
    await createPriceListItem(tenant.tenantId, actorUserId, priceListId, { productUnitId: productUnit.id, price: 20 });
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("returns NOT_FOUND for a nonexistent product unit", async () => {
    const result = await resolveCartLine(tenant.tenantId, customerId, "00000000-0000-0000-0000-000000000000", 1);
    expect(result).toEqual({
      ok: false,
      productUnitId: "00000000-0000-0000-0000-000000000000",
      requestedQty: 1,
      issue: "NOT_FOUND",
    });
  });

  it("rejects a quantity below the minimum order quantity", async () => {
    const result = await resolveCartLine(tenant.tenantId, customerId, steppedProductUnitId, 3);
    expect(result).toEqual({ ok: false, productUnitId: steppedProductUnitId, requestedQty: 3, issue: "BELOW_MIN_QTY" });
  });

  it("rejects a quantity that doesn't align with the order increment", async () => {
    const result = await resolveCartLine(tenant.tenantId, customerId, steppedProductUnitId, 7);
    expect(result).toEqual({
      ok: false,
      productUnitId: steppedProductUnitId,
      requestedQty: 7,
      issue: "INVALID_INCREMENT",
    });
  });

  it("accepts the minimum order quantity and further exact increments", async () => {
    const atMin = await resolveCartLine(tenant.tenantId, customerId, steppedProductUnitId, 5);
    expect(atMin.ok).toBe(true);

    const atSecondStep = await resolveCartLine(tenant.tenantId, customerId, steppedProductUnitId, 10);
    expect(atSecondStep.ok).toBe(true);
  });

  it("rejects a zero or negative quantity as INVALID_QUANTITY", async () => {
    const zero = await resolveCartLine(tenant.tenantId, customerId, steppedProductUnitId, 0);
    expect(zero).toEqual({ ok: false, productUnitId: steppedProductUnitId, requestedQty: 0, issue: "INVALID_QUANTITY" });

    const negative = await resolveCartLine(tenant.tenantId, customerId, steppedProductUnitId, -5);
    expect(negative.ok).toBe(false);
  });

  it("computes price/VAT/totals from the database - never from anything the caller supplies", async () => {
    // resolveCartLine's signature only accepts (tenantId, customerId, productUnitId, requestedQty) -
    // there is no price parameter to manipulate in the first place. This
    // test asserts the resolved price always matches server-side state,
    // which is what makes a client-supplied price meaningless even if a
    // modified browser tried to send one anywhere in this flow.
    const result = await resolveCartLine(tenant.tenantId, customerId, steppedProductUnitId, 5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.basePrice).toBe(20);
      expect(result.unitPrice).toBe(20);
      expect(result.lineSubtotal).toBe(100);
      expect(result.currency).toBe("MKD");
    }
  });

  it("excludes a hidden product via HIDDEN_FOR_CUSTOMER", async () => {
    const seededFixture = await withTenantContext(tenant.tenantId, (tx) =>
      tx.productUnit.findFirstOrThrow({ where: { id: steppedProductUnitId }, include: { product: true } })
    );
    await setCustomerProductVisibility(tenant.tenantId, actorUserId, customerId, seededFixture.productId, "HIDDEN");

    const result = await resolveCartLine(tenant.tenantId, customerId, steppedProductUnitId, 5);
    expect(result).toEqual({
      ok: false,
      productUnitId: steppedProductUnitId,
      requestedQty: 5,
      issue: "HIDDEN_FOR_CUSTOMER",
    });

    await setCustomerProductVisibility(tenant.tenantId, actorUserId, customerId, seededFixture.productId, null);
  });
});
