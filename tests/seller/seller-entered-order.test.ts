import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { submitOrder } from "@/lib/domain/orders/order-service";
import { listActiveCustomerAddresses, listCustomerAddresses } from "@/lib/domain/customers/customer-address-service";
import { setCustomerDiscount } from "@/lib/domain/customers/customer-discount-service";
import { setCustomerProductVisibility } from "@/lib/domain/customers/customer-product-visibility-service";
import { listOrdersForCustomer } from "@/lib/domain/orders/order-service";

/**
 * A seller entering an order on a customer's behalf must reuse the exact
 * same submitOrder/resolveCartLine path a buyer's own checkout uses - see
 * src/lib/domain/orders/order-service.ts's submitOrder docstring. These
 * tests exercise that path with actingContext "TENANT" and a seller actor,
 * asserting there is no special seller pricing/visibility bypass anywhere.
 */
describe("seller-entered order", () => {
  let tenant: SeededTenant;
  let otherTenant: SeededTenant;
  let sellerActorUserId: string;
  let customerId: string;
  let addressId: string;
  let seededProductUnitId: string;
  let seededProductId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Tau", "tau-seller-order", passwordHash);
    otherTenant = await seedTenant("Upsilon", "upsilon-seller-order", passwordHash);
    sellerActorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
    customerId = tenant.customers[0].id;

    const addresses = await listActiveCustomerAddresses(tenant.tenantId, customerId);
    addressId = addresses[0].id;

    const seededFixture = await withTenantContext(tenant.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));
    seededProductUnitId = seededFixture.id;
    seededProductId = seededFixture.productId;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("creates an order with the seller as actor and actingContext TENANT recorded in the audit", async () => {
    const result = await submitOrder(
      tenant.tenantId,
      customerId,
      sellerActorUserId,
      "Alpha Seller Admin",
      "SELLER_ADMIN",
      "TENANT",
      { deliveryAddressId: addressId, lines: [{ productUnitId: seededProductUnitId, quantity: 2 }] }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.placedByUserId).toBe(sellerActorUserId);
    expect(result.order.placedByName).toBe("Alpha Seller Admin");
    expect(result.order.placedByRole).toBe("SELLER_ADMIN");

    const auditEntry = await withTenantContext(tenant.tenantId, (tx) =>
      tx.auditLogEntry.findFirstOrThrow({ where: { entityType: "Order", entityId: result.order.id, action: "CREATE" } })
    );
    expect(auditEntry.actingContext).toBe("TENANT");
    expect(auditEntry.actorUserId).toBe(sellerActorUserId);
    expect(auditEntry.reason).toMatch(/seller/i);
  });

  it("uses the customer's own discount when the seller enters the order", async () => {
    await setCustomerDiscount(tenant.tenantId, sellerActorUserId, customerId, 20);

    const result = await submitOrder(
      tenant.tenantId,
      customerId,
      sellerActorUserId,
      "Alpha Seller Admin",
      "SELLER_ADMIN",
      "TENANT",
      { deliveryAddressId: addressId, lines: [{ productUnitId: seededProductUnitId, quantity: 1 }] }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number(result.order.lines[0].unitPriceAtOrderTime)).toBe(100);
      expect(Number(result.order.lines[0].discountPercentAtOrderTime)).toBe(20);
    }

    await setCustomerDiscount(tenant.tenantId, sellerActorUserId, customerId, null);
  });

  it("cannot include a product hidden for that specific customer - no seller bypass", async () => {
    await setCustomerProductVisibility(tenant.tenantId, sellerActorUserId, customerId, seededProductId, "HIDDEN");

    const result = await submitOrder(
      tenant.tenantId,
      customerId,
      sellerActorUserId,
      "Alpha Seller Admin",
      "SELLER_ADMIN",
      "TENANT",
      { deliveryAddressId: addressId, lines: [{ productUnitId: seededProductUnitId, quantity: 1 }] }
    );

    expect(result).toEqual({
      ok: false,
      reason: "LINE_ISSUES",
      lineIssues: [{ productUnitId: seededProductUnitId, issue: "HIDDEN_FOR_CUSTOMER" }],
    });

    await setCustomerProductVisibility(tenant.tenantId, sellerActorUserId, customerId, seededProductId, null);
  });

  it("cannot manipulate the price - the stored snapshot always matches the resolved database price", async () => {
    const priceListItem = await withTenantContext(tenant.tenantId, (tx) =>
      tx.priceListItem.findFirstOrThrow({ where: { productUnitId: seededProductUnitId } })
    );
    await withTenantContext(tenant.tenantId, (tx) =>
      tx.priceListItem.update({ where: { id: priceListItem.id }, data: { price: 777 } })
    );

    const result = await submitOrder(
      tenant.tenantId,
      customerId,
      sellerActorUserId,
      "Alpha Seller Admin",
      "SELLER_ADMIN",
      "TENANT",
      { deliveryAddressId: addressId, lines: [{ productUnitId: seededProductUnitId, quantity: 1 }] }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number(result.order.lines[0].unitPriceAtOrderTime)).toBe(777);
    }

    await withTenantContext(tenant.tenantId, (tx) =>
      tx.priceListItem.update({ where: { id: priceListItem.id }, data: { price: 100 } })
    );
  });

  it("rejects a customer id belonging to another tenant", async () => {
    // resolveCartLine (via resolveEffectivePrice) looks up the customer
    // scoped to THIS tenant before any pricing is resolved - a customerId
    // from another tenant simply doesn't exist under this tenantId, so it
    // fails safe as CUSTOMER_INACTIVE per-line, before submitOrder's own
    // (now redundant, but still correct) customer-active check is ever
    // reached.
    const foreignCustomerId = otherTenant.customers[0].id;
    const result = await submitOrder(
      tenant.tenantId,
      foreignCustomerId,
      sellerActorUserId,
      "Alpha Seller Admin",
      "SELLER_ADMIN",
      "TENANT",
      { deliveryAddressId: addressId, lines: [{ productUnitId: seededProductUnitId, quantity: 1 }] }
    );
    expect(result).toEqual({
      ok: false,
      reason: "LINE_ISSUES",
      lineIssues: [{ productUnitId: seededProductUnitId, issue: "CUSTOMER_INACTIVE" }],
    });
  });

  it("rejects an address belonging to a different customer under the same tenant", async () => {
    const otherCustomerId = tenant.customers[1].id;
    const otherCustomerAddresses = await listCustomerAddresses(tenant.tenantId, otherCustomerId);

    const result = await submitOrder(
      tenant.tenantId,
      customerId,
      sellerActorUserId,
      "Alpha Seller Admin",
      "SELLER_ADMIN",
      "TENANT",
      { deliveryAddressId: otherCustomerAddresses[0].id, lines: [{ productUnitId: seededProductUnitId, quantity: 1 }] }
    );
    expect(result).toEqual({ ok: false, reason: "ADDRESS_NOT_FOUND" });
  });

  it("rejects a product unit belonging to a different tenant", async () => {
    const foreignProductUnit = await withTenantContext(otherTenant.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));

    const result = await submitOrder(
      tenant.tenantId,
      customerId,
      sellerActorUserId,
      "Alpha Seller Admin",
      "SELLER_ADMIN",
      "TENANT",
      { deliveryAddressId: addressId, lines: [{ productUnitId: foreignProductUnit.id, quantity: 1 }] }
    );
    expect(result).toEqual({
      ok: false,
      reason: "LINE_ISSUES",
      lineIssues: [{ productUnitId: foreignProductUnit.id, issue: "NOT_FOUND" }],
    });
  });

  it("appears correctly in the buyer's own order history once entered by the seller", async () => {
    const result = await submitOrder(
      tenant.tenantId,
      customerId,
      sellerActorUserId,
      "Alpha Seller Admin",
      "SELLER_ADMIN",
      "TENANT",
      { deliveryAddressId: addressId, lines: [{ productUnitId: seededProductUnitId, quantity: 1 }] }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const buyerOrders = await listOrdersForCustomer(tenant.tenantId, customerId);
    expect(buyerOrders.map((o) => o.id)).toContain(result.order.id);
  });
});
