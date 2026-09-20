import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { createCustomer, setCustomerActive } from "@/lib/domain/customers/customer-service";
import { createPriceList, setPriceListActive } from "@/lib/domain/pricing/price-list-service";
import { createPriceListItem } from "@/lib/domain/pricing/price-list-item-service";
import { setCustomerPriceListAssignment } from "@/lib/domain/customers/customer-price-list-assignment-service";
import { setCustomerDiscount } from "@/lib/domain/customers/customer-discount-service";
import { setCustomerProductVisibility } from "@/lib/domain/customers/customer-product-visibility-service";
import { resolveEffectivePrice } from "@/lib/domain/pricing/pricing-resolution";

describe("pricing resolution", () => {
  let tenant: SeededTenant;
  let actorUserId: string;
  let productId: string;
  let productUnitId: string;
  let customerId: string;
  let priceListId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Epsilon", "epsilon-pricing", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;

    const productUnit = await withTenantContext(tenant.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));
    productUnitId = productUnit.id;
    productId = productUnit.productId;

    const customer = await createCustomer(tenant.tenantId, actorUserId, { name: "Resolution Test", isActive: true });
    customerId = customer.id;

    const priceList = await createPriceList(tenant.tenantId, actorUserId, {
      name: "Resolution List",
      currency: "MKD",
      isDefault: true,
      isActive: true,
    });
    priceListId = priceList.id;
    await createPriceListItem(tenant.tenantId, actorUserId, priceListId, { productUnitId, price: 200 });
    await setCustomerPriceListAssignment(tenant.tenantId, actorUserId, customerId, priceListId);
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("resolves the base price with no discount", async () => {
    const result = await resolveEffectivePrice(tenant.tenantId, customerId, productUnitId);
    expect(result).toEqual({
      available: true,
      productUnitId,
      basePrice: 200,
      discountPercent: 0,
      finalPrice: 200,
      currency: "MKD",
    });
  });

  it("applies the customer's discount AFTER the base price-list price", async () => {
    await setCustomerDiscount(tenant.tenantId, actorUserId, customerId, 10);
    const result = await resolveEffectivePrice(tenant.tenantId, customerId, productUnitId);
    expect(result).toMatchObject({ available: true, basePrice: 200, discountPercent: 10, finalPrice: 180 });
    await setCustomerDiscount(tenant.tenantId, actorUserId, customerId, null); // reset for later tests
  });

  it("rounds the discounted price to 2 decimal places", async () => {
    const oddPriceList = await createPriceList(tenant.tenantId, actorUserId, {
      name: "Odd Pricing",
      currency: "MKD",
      isDefault: false,
      isActive: true,
    });
    await createPriceListItem(tenant.tenantId, actorUserId, oddPriceList.id, { productUnitId, price: 99.99 });

    const customer = await createCustomer(tenant.tenantId, actorUserId, { name: "Rounding Test", isActive: true });
    await setCustomerPriceListAssignment(tenant.tenantId, actorUserId, customer.id, oddPriceList.id);
    await setCustomerDiscount(tenant.tenantId, actorUserId, customer.id, 33.33);

    const result = await resolveEffectivePrice(tenant.tenantId, customer.id, productUnitId);
    expect(result.available).toBe(true);
    if (result.available) {
      // 99.99 * (1 - 0.3333) = 66.66333... -> rounds to 66.66
      expect(result.finalPrice).toBe(66.66);
    }
  });

  it("fails safe when the customer has no price list assignment", async () => {
    const customer = await createCustomer(tenant.tenantId, actorUserId, { name: "No Assignment", isActive: true });
    const result = await resolveEffectivePrice(tenant.tenantId, customer.id, productUnitId);
    expect(result).toEqual({ available: false, reason: "NO_ASSIGNMENT" });
  });

  it("fails safe when the assigned price list has no item for this product unit", async () => {
    const emptyPriceList = await createPriceList(tenant.tenantId, actorUserId, {
      name: "Empty",
      currency: "MKD",
      isDefault: false,
      isActive: true,
    });
    const customer = await createCustomer(tenant.tenantId, actorUserId, { name: "No Price", isActive: true });
    await setCustomerPriceListAssignment(tenant.tenantId, actorUserId, customer.id, emptyPriceList.id);

    const result = await resolveEffectivePrice(tenant.tenantId, customer.id, productUnitId);
    expect(result).toEqual({ available: false, reason: "NO_PRICE" });
  });

  it("fails safe when the assigned price list has been deactivated", async () => {
    const deactivatedList = await createPriceList(tenant.tenantId, actorUserId, {
      name: "Will Deactivate",
      currency: "MKD",
      isDefault: false,
      isActive: true,
    });
    await createPriceListItem(tenant.tenantId, actorUserId, deactivatedList.id, { productUnitId, price: 50 });
    const customer = await createCustomer(tenant.tenantId, actorUserId, { name: "Deactivated List", isActive: true });
    await setCustomerPriceListAssignment(tenant.tenantId, actorUserId, customer.id, deactivatedList.id);
    await setPriceListActive(tenant.tenantId, actorUserId, deactivatedList.id, false);

    const result = await resolveEffectivePrice(tenant.tenantId, customer.id, productUnitId);
    expect(result).toEqual({ available: false, reason: "NO_ASSIGNMENT" });
  });

  it("fails safe when the customer is inactive", async () => {
    const customer = await createCustomer(tenant.tenantId, actorUserId, { name: "Inactive Customer", isActive: true });
    await setCustomerPriceListAssignment(tenant.tenantId, actorUserId, customer.id, priceListId);
    await setCustomerActive(tenant.tenantId, actorUserId, customer.id, false);

    const result = await resolveEffectivePrice(tenant.tenantId, customer.id, productUnitId);
    expect(result).toEqual({ available: false, reason: "CUSTOMER_INACTIVE" });
  });

  describe("visibility resolution precedence", () => {
    it("is visible by default with no override", async () => {
      const result = await resolveEffectivePrice(tenant.tenantId, customerId, productUnitId);
      expect(result.available).toBe(true);
    });

    it("an explicit HIDDEN override makes it unavailable", async () => {
      await setCustomerProductVisibility(tenant.tenantId, actorUserId, customerId, productId, "HIDDEN");
      const result = await resolveEffectivePrice(tenant.tenantId, customerId, productUnitId);
      expect(result).toEqual({ available: false, reason: "HIDDEN_FOR_CUSTOMER" });
    });

    it("clearing the override (back to default) restores visibility", async () => {
      await setCustomerProductVisibility(tenant.tenantId, actorUserId, customerId, productId, null);
      const result = await resolveEffectivePrice(tenant.tenantId, customerId, productUnitId);
      expect(result.available).toBe(true);
    });

    it("an inactive product remains unavailable regardless of a VISIBLE override", async () => {
      await setCustomerProductVisibility(tenant.tenantId, actorUserId, customerId, productId, "VISIBLE");
      await withTenantContext(tenant.tenantId, (tx) => tx.product.update({ where: { id: productId }, data: { isActive: false } }));

      const result = await resolveEffectivePrice(tenant.tenantId, customerId, productUnitId);
      expect(result).toEqual({ available: false, reason: "PRODUCT_INACTIVE" });

      // restore for any subsequent tests
      await withTenantContext(tenant.tenantId, (tx) => tx.product.update({ where: { id: productId }, data: { isActive: true } }));
      await setCustomerProductVisibility(tenant.tenantId, actorUserId, customerId, productId, null);
    });

    it("an inactive product unit remains unavailable even though the product itself is active", async () => {
      await withTenantContext(tenant.tenantId, (tx) => tx.productUnit.update({ where: { id: productUnitId }, data: { isActive: false } }));

      const result = await resolveEffectivePrice(tenant.tenantId, customerId, productUnitId);
      expect(result).toEqual({ available: false, reason: "PRODUCT_UNIT_INACTIVE" });

      await withTenantContext(tenant.tenantId, (tx) => tx.productUnit.update({ where: { id: productUnitId }, data: { isActive: true } }));
    });
  });
});
