import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { submitOrder } from "@/lib/domain/orders/order-service";
import { listActiveCustomerAddressesForBuyer } from "@/lib/domain/customers/customer-address-service";
import { createCategory } from "@/lib/domain/catalog/category-service";
import { createProduct, setProductActive } from "@/lib/domain/catalog/product-service";
import { createProductUnit } from "@/lib/domain/catalog/product-unit-service";
import { createPriceListItem, updatePriceListItem } from "@/lib/domain/pricing/price-list-item-service";
import { setCustomerDiscount } from "@/lib/domain/customers/customer-discount-service";

describe("submitOrder", () => {
  let tenant: SeededTenant;
  let otherTenant: SeededTenant;
  let actorUserId: string;
  let buyerUserId: string;
  let customerId: string;
  let addressId: string;
  let priceListId: string;
  let seededProductUnitId: string;
  let unitOfMeasureId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Kappa", "kappa-submit", passwordHash);
    otherTenant = await seedTenant("Lambda", "lambda-submit", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
    customerId = tenant.customers[0].id;
    buyerUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.customers[0].buyerEmail } })).id;

    const addresses = await listActiveCustomerAddressesForBuyer(tenant.tenantId, customerId);
    addressId = addresses[0].id;

    const seededFixture = await withTenantContext(tenant.tenantId, (tx) =>
      tx.productUnit.findFirstOrThrow({ include: { product: true } })
    );
    seededProductUnitId = seededFixture.id;
    unitOfMeasureId = seededFixture.unitOfMeasureId;

    const priceList = await withTenantContext(tenant.tenantId, (tx) => tx.priceList.findFirstOrThrow({}));
    priceListId = priceList.id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("submits a valid order, snapshotting price/discount/VAT/address and starting SUBMITTED", async () => {
    await setCustomerDiscount(tenant.tenantId, actorUserId, customerId, 10);

    const result = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", {
      deliveryAddressId: addressId,
      note: "Please deliver in the morning",
      lines: [{ productUnitId: seededProductUnitId, quantity: 2 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.order.status).toBe("SUBMITTED");
    expect(result.order.submittedAt).not.toBeNull();
    expect(result.order.note).toBe("Please deliver in the morning");
    expect(result.order.deliveryAddressId).toBe(addressId);
    expect(result.order.deliveryAddressSnapshot).toMatchObject({ city: "Skopje" });

    expect(result.order.lines).toHaveLength(1);
    const line = result.order.lines[0];
    expect(Number(line.requestedQty)).toBe(2);
    expect(Number(line.unitPriceAtOrderTime)).toBe(100); // seeded price-list price, BEFORE discount
    expect(Number(line.discountPercentAtOrderTime)).toBe(10);
    expect(Number(line.vatRateAtOrderTime)).toBe(18); // tenant default VAT rate from seedTenant

    await setCustomerDiscount(tenant.tenantId, actorUserId, customerId, null);
  });

  it("allocates sequential order numbers per tenant", async () => {
    const first = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: seededProductUnitId, quantity: 1 }],
    });
    const second = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: seededProductUnitId, quantity: 1 }],
    });

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.order.orderNumber).toBe(first.order.orderNumber + 1);
    }
  });

  it("rejects submission with an empty cart", async () => {
    const result = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", {
      deliveryAddressId: addressId,
      lines: [],
    });
    expect(result).toEqual({ ok: false, reason: "EMPTY_CART" });
  });

  it("rejects an address that belongs to a different customer", async () => {
    const otherCustomerAddresses = await listActiveCustomerAddressesForBuyer(tenant.tenantId, tenant.customers[1].id);
    const foreignAddressId = otherCustomerAddresses[0].id;

    const result = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", {
      deliveryAddressId: foreignAddressId,
      lines: [{ productUnitId: seededProductUnitId, quantity: 1 }],
    });
    expect(result).toEqual({ ok: false, reason: "ADDRESS_NOT_FOUND" });
  });

  it("rejects an address belonging to a different tenant entirely", async () => {
    const foreignAddresses = await listActiveCustomerAddressesForBuyer(
      otherTenant.tenantId,
      otherTenant.customers[0].id
    );
    const result = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", {
      deliveryAddressId: foreignAddresses[0].id,
      lines: [{ productUnitId: seededProductUnitId, quantity: 1 }],
    });
    expect(result).toEqual({ ok: false, reason: "ADDRESS_NOT_FOUND" });
  });

  it("rejects the whole order when one line is no longer valid (hidden/inactive/unpriced/below-min-qty)", async () => {
    const category = await createCategory(tenant.tenantId, actorUserId, {
      nameMk: "Х",
      nameEn: "X",
      sortOrder: 0,
      isActive: true,
    });
    const inactiveProduct = await createProduct(tenant.tenantId, actorUserId, {
      nameMk: "Ќе стане неактивен",
      nameEn: "Will Be Inactive",
      sku: "WILL-BE-INACTIVE-1",
      categoryId: category.id,
      isActive: true,
    });
    const inactiveProductUnit = await createProductUnit(tenant.tenantId, actorUserId, inactiveProduct.id, {
      unitOfMeasureId,
      sku: "WILL-BE-INACTIVE-1-EA",
      label: "Each",
      minOrderQty: 1,
      orderIncrement: 1,
      isDefault: true,
      isActive: true,
    });
    await createPriceListItem(tenant.tenantId, actorUserId, priceListId, {
      productUnitId: inactiveProductUnit.id,
      price: 5,
    });
    await setProductActive(tenant.tenantId, actorUserId, inactiveProduct.id, false);

    const ordersBefore = await withTenantContext(tenant.tenantId, (tx) => tx.order.count({ where: { customerId } }));

    const result = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", {
      deliveryAddressId: addressId,
      lines: [
        { productUnitId: seededProductUnitId, quantity: 1 },
        { productUnitId: inactiveProductUnit.id, quantity: 1 },
      ],
    });

    expect(result).toEqual({
      ok: false,
      reason: "LINE_ISSUES",
      lineIssues: [{ productUnitId: inactiveProductUnit.id, issue: "PRODUCT_INACTIVE" }],
    });

    // Nothing was written - a partially-valid cart never becomes a partial order.
    const ordersAfter = await withTenantContext(tenant.tenantId, (tx) => tx.order.count({ where: { customerId } }));
    expect(ordersAfter).toBe(ordersBefore);
  });

  it("rejects a cart line referencing another tenant's product unit as NOT_FOUND", async () => {
    const foreignFixture = await withTenantContext(otherTenant.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));

    const result = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: foreignFixture.id, quantity: 1 }],
    });

    expect(result).toEqual({
      ok: false,
      reason: "LINE_ISSUES",
      lineIssues: [{ productUnitId: foreignFixture.id, issue: "NOT_FOUND" }],
    });
  });

  it("re-prices at submission time, ignoring whatever price was current when the item was added to the cart", async () => {
    // The seeded price-list item for this product unit already exists (see
    // prisma/seed.ts) - fetch it so it can be updated below.
    const item = await withTenantContext(tenant.tenantId, (tx) =>
      tx.priceListItem.findFirstOrThrow({ where: { priceListId, productUnitId: seededProductUnitId } })
    );

    // Simulate a seller price change happening after the buyer added the
    // item to their (browser-only) cart but before they checked out.
    await updatePriceListItem(tenant.tenantId, actorUserId, item.id, { price: 250 });

    const result = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: seededProductUnitId, quantity: 1 }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number(result.order.lines[0].unitPriceAtOrderTime)).toBe(250);
    }

    await updatePriceListItem(tenant.tenantId, actorUserId, item.id, { price: 100 });
  });

  it("records cutOffWarningShown when the tenant's configured cut-off time has passed for a next-day delivery", async () => {
    // "00:01" is guaranteed to already be in the past for any wall-clock
    // time this test could plausibly run at, so this integration check is
    // deterministic without needing to fake the clock - the exact
    // boundary/threshold logic itself is covered by tests/unit/cutoff.test.ts.
    await prismaBase.tenant.update({ where: { id: tenant.tenantId }, data: { cutOffTime: "00:01" } });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", {
      deliveryAddressId: addressId,
      requestedDeliveryDate: tomorrow,
      lines: [{ productUnitId: seededProductUnitId, quantity: 1 }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order.cutOffWarningShown).toBe(true);
      expect(result.order.requestedDeliveryDate).not.toBeNull();
    }

    await prismaBase.tenant.update({ where: { id: tenant.tenantId }, data: { cutOffTime: null } });
  });

  it("rejects submission for an inactive customer", async () => {
    const { createCustomer, setCustomerActive } = await import("@/lib/domain/customers/customer-service");
    const { createCustomerAddress } = await import("@/lib/domain/customers/customer-address-service");
    const { setCustomerPriceListAssignment } = await import(
      "@/lib/domain/customers/customer-price-list-assignment-service"
    );

    const inactiveCustomer = await createCustomer(tenant.tenantId, actorUserId, {
      name: "Soon Inactive",
      isActive: true,
    });
    const inactiveAddress = await createCustomerAddress(tenant.tenantId, actorUserId, inactiveCustomer.id, {
      label: "Main",
      recipientName: "Someone",
      addressLine1: "1 St",
      city: "Skopje",
      country: "MK",
      isDefaultDelivery: true,
      isDefaultBilling: false,
      isActive: true,
    });
    await setCustomerPriceListAssignment(tenant.tenantId, actorUserId, inactiveCustomer.id, priceListId);
    await setCustomerActive(tenant.tenantId, actorUserId, inactiveCustomer.id, false);

    const result = await submitOrder(tenant.tenantId, inactiveCustomer.id, buyerUserId, "Test Buyer", "BUYER_ADMIN", {
      deliveryAddressId: inactiveAddress.id,
      lines: [{ productUnitId: seededProductUnitId, quantity: 1 }],
    });

    // resolveCartLine already fails safe with CUSTOMER_INACTIVE before the
    // write transaction is even reached.
    expect(result).toEqual({
      ok: false,
      reason: "LINE_ISSUES",
      lineIssues: [{ productUnitId: seededProductUnitId, issue: "CUSTOMER_INACTIVE" }],
    });
  });
});
