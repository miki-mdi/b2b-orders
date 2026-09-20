import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { getOrderForTenant, listOrdersForTenant, submitOrder } from "@/lib/domain/orders/order-service";
import { listActiveCustomerAddresses } from "@/lib/domain/customers/customer-address-service";

describe("seller order inbox: listing, filtering, and tenant isolation", () => {
  let alpha: SeededTenant;
  let beta: SeededTenant;
  let alphaOrderId: string;
  let betaOrderId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    alpha = await seedTenant("Phi", "phi-inbox", passwordHash);
    beta = await seedTenant("Chi", "chi-inbox", passwordHash);

    const alphaBuyerUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: alpha.customers[0].buyerEmail } })).id;
    const alphaAddresses = await listActiveCustomerAddresses(alpha.tenantId, alpha.customers[0].id);
    const alphaProductUnit = await withTenantContext(alpha.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));
    const alphaOrder = await submitOrder(alpha.tenantId, alpha.customers[0].id, alphaBuyerUserId, "Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: alphaAddresses[0].id,
      lines: [{ productUnitId: alphaProductUnit.id, quantity: 1 }],
    });
    if (!alphaOrder.ok) throw new Error("setup failed");
    alphaOrderId = alphaOrder.order.id;

    const betaBuyerUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: beta.customers[0].buyerEmail } })).id;
    const betaAddresses = await listActiveCustomerAddresses(beta.tenantId, beta.customers[0].id);
    const betaProductUnit = await withTenantContext(beta.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));
    const betaOrder = await submitOrder(beta.tenantId, beta.customers[0].id, betaBuyerUserId, "Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: betaAddresses[0].id,
      lines: [{ productUnitId: betaProductUnit.id, quantity: 1 }],
    });
    if (!betaOrder.ok) throw new Error("setup failed");
    betaOrderId = betaOrder.order.id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("listOrdersForTenant never includes another tenant's orders", async () => {
    const alphaOrders = await listOrdersForTenant(alpha.tenantId);
    expect(alphaOrders.map((o) => o.id)).toContain(alphaOrderId);
    expect(alphaOrders.map((o) => o.id)).not.toContain(betaOrderId);
  });

  it("getOrderForTenant returns null for another tenant's order", async () => {
    const result = await getOrderForTenant(beta.tenantId, alphaOrderId);
    expect(result).toBeNull();
  });

  it("filters by status", async () => {
    const submitted = await listOrdersForTenant(alpha.tenantId, { status: "SUBMITTED" });
    expect(submitted.map((o) => o.id)).toContain(alphaOrderId);

    const delivered = await listOrdersForTenant(alpha.tenantId, { status: "DELIVERED" });
    expect(delivered.map((o) => o.id)).not.toContain(alphaOrderId);
  });

  it("searches by exact order number and by customer name", async () => {
    const order = await withTenantContext(alpha.tenantId, (tx) => tx.order.findUniqueOrThrow({ where: { id: alphaOrderId } }));

    const byNumber = await listOrdersForTenant(alpha.tenantId, { search: String(order.orderNumber) });
    expect(byNumber.map((o) => o.id)).toContain(alphaOrderId);

    const byCustomerName = await listOrdersForTenant(alpha.tenantId, { search: alpha.customers[0].name });
    expect(byCustomerName.map((o) => o.id)).toContain(alphaOrderId);

    const noMatch = await listOrdersForTenant(alpha.tenantId, { search: "no-such-order-xyz" });
    expect(noMatch.map((o) => o.id)).not.toContain(alphaOrderId);
  });

  it("RLS alone (bypassing Layer 2) blocks a cross-tenant order read", async () => {
    const rows = await prismaBase.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${alpha.tenantId}, true)`;
      return tx.order.findMany({});
    });
    expect(rows.map((o) => o.id)).not.toContain(betaOrderId);
  });
});
