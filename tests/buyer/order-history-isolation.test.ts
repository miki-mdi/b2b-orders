import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { getOrderForCustomer, listOrdersForCustomer, submitOrder } from "@/lib/domain/orders/order-service";
import { listActiveCustomerAddressesForBuyer } from "@/lib/domain/customers/customer-address-service";
import { listBuyerCatalog } from "@/lib/domain/catalog/buyer-catalog-service";

describe("buyer order history and cross-tenant/customer isolation", () => {
  let alpha: SeededTenant;
  let beta: SeededTenant;
  let alphaBuyerOneOrderId: string;
  let alphaBuyerTwoOrderId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    alpha = await seedTenant("Nu", "nu-history", passwordHash);
    beta = await seedTenant("Xi", "xi-history", passwordHash);

    const alphaCustomerOne = alpha.customers[0].id;
    const alphaCustomerTwo = alpha.customers[1].id;
    const alphaBuyerOneUserId = (
      await prismaBase.user.findUniqueOrThrow({ where: { email: alpha.customers[0].buyerEmail } })
    ).id;
    const alphaBuyerTwoUserId = (
      await prismaBase.user.findUniqueOrThrow({ where: { email: alpha.customers[1].buyerEmail } })
    ).id;

    const alphaProductUnit = await withTenantContext(alpha.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));

    const addressesOne = await listActiveCustomerAddressesForBuyer(alpha.tenantId, alphaCustomerOne);
    const orderOne = await submitOrder(alpha.tenantId, alphaCustomerOne, alphaBuyerOneUserId, "Buyer One", "BUYER_ADMIN", {
      deliveryAddressId: addressesOne[0].id,
      lines: [{ productUnitId: alphaProductUnit.id, quantity: 1 }],
    });
    if (!orderOne.ok) throw new Error("setup: expected order submission to succeed");
    alphaBuyerOneOrderId = orderOne.order.id;

    const addressesTwo = await listActiveCustomerAddressesForBuyer(alpha.tenantId, alphaCustomerTwo);
    const orderTwo = await submitOrder(alpha.tenantId, alphaCustomerTwo, alphaBuyerTwoUserId, "Buyer Two", "BUYER_ADMIN", {
      deliveryAddressId: addressesTwo[0].id,
      lines: [{ productUnitId: alphaProductUnit.id, quantity: 1 }],
    });
    if (!orderTwo.ok) throw new Error("setup: expected order submission to succeed");
    alphaBuyerTwoOrderId = orderTwo.order.id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("a customer's order list never includes another customer's orders, even within the same tenant", async () => {
    const customerOneOrders = await listOrdersForCustomer(alpha.tenantId, alpha.customers[0].id);
    expect(customerOneOrders.map((o) => o.id)).toContain(alphaBuyerOneOrderId);
    expect(customerOneOrders.map((o) => o.id)).not.toContain(alphaBuyerTwoOrderId);
  });

  it("getOrderForCustomer returns null for another customer's order (same tenant)", async () => {
    const result = await getOrderForCustomer(alpha.tenantId, alpha.customers[0].id, alphaBuyerTwoOrderId);
    expect(result).toBeNull();
  });

  it("getOrderForCustomer returns null for an order from a completely different tenant", async () => {
    const result = await getOrderForCustomer(beta.tenantId, beta.customers[0].id, alphaBuyerOneOrderId);
    expect(result).toBeNull();
  });

  it("listOrdersForCustomer under one tenant never includes another tenant's orders", async () => {
    const betaOrders = await listOrdersForCustomer(beta.tenantId, beta.customers[0].id);
    expect(betaOrders.map((o) => o.id)).not.toContain(alphaBuyerOneOrderId);
    expect(betaOrders.map((o) => o.id)).not.toContain(alphaBuyerTwoOrderId);
  });

  it("the buyer catalog never leaks another tenant's products", async () => {
    const betaCatalog = await listBuyerCatalog(beta.tenantId, beta.customers[0].id, {});
    const alphaCatalog = await listBuyerCatalog(alpha.tenantId, alpha.customers[0].id, {});
    const betaProductUnitIds = new Set(betaCatalog.map((i) => i.productUnitId));
    for (const item of alphaCatalog) {
      expect(betaProductUnitIds.has(item.productUnitId)).toBe(false);
    }
  });
});
