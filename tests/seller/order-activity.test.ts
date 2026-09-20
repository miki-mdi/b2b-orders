import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { submitOrder } from "@/lib/domain/orders/order-service";
import { confirmOrder, advanceOrderStatus } from "@/lib/domain/orders/order-fulfillment-service";
import { listActiveCustomerAddresses } from "@/lib/domain/customers/customer-address-service";
import { listOrderActivity, OrderNotFoundForActivityError } from "@/lib/domain/orders/order-activity-service";

describe("listOrderActivity", () => {
  let tenant: SeededTenant;
  let otherTenant: SeededTenant;
  let actorUserId: string;
  let buyerUserId: string;
  let customerId: string;
  let addressId: string;
  let productUnitId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Rho", "rho-activity", passwordHash);
    otherTenant = await seedTenant("Tau", "tau-activity", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
    customerId = tenant.customers[0].id;
    buyerUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.customers[0].buyerEmail } })).id;

    const addresses = await listActiveCustomerAddresses(tenant.tenantId, customerId);
    addressId = addresses[0].id;
    const productUnit = await withTenantContext(tenant.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));
    productUnitId = productUnit.id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("returns creation, confirmation, and status-advance events in chronological order, and nothing invented", async () => {
    const submitResult = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId, quantity: 5 }],
    });
    if (!submitResult.ok) throw new Error("setup failed");
    const orderId = submitResult.order.id;
    const lineId = submitResult.order.lines[0].id;

    const confirmResult = await confirmOrder(tenant.tenantId, actorUserId, orderId, [
      { orderLineId: lineId, confirmedQty: 3, reason: "Partial stock" },
    ]);
    if (!confirmResult.ok) throw new Error("setup failed");

    const advanceResult = await advanceOrderStatus(tenant.tenantId, actorUserId, orderId, "PICKING");
    if (!advanceResult.ok) throw new Error("setup failed");

    const activity = await listOrderActivity(tenant.tenantId, orderId);

    // Chronological (ascending createdAt).
    for (let i = 1; i < activity.length; i++) {
      expect(activity[i].createdAt.getTime()).toBeGreaterThanOrEqual(activity[i - 1].createdAt.getTime());
    }

    expect(activity.some((e) => e.entityType === "Order" && e.action === "CREATE")).toBe(true);
    expect(
      activity.some((e) => e.entityType === "OrderLine" && e.fieldName === "confirmedQty" && e.reason === "Partial stock")
    ).toBe(true);
    expect(
      activity.some((e) => e.entityType === "Order" && e.fieldName === "status" && e.newValue === JSON.stringify("PICKING"))
    ).toBe(true);
    // Exactly the events actually written - CREATE, confirmedQty adjustment,
    // SUBMITTED->CONFIRMED status, CONFIRMED->PICKING status. Nothing synthesized.
    expect(activity).toHaveLength(4);
  });

  it("throws for an order belonging to a different tenant, rather than leaking its activity", async () => {
    const otherCustomerId = otherTenant.customers[0].id;
    const otherBuyerUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: otherTenant.customers[0].buyerEmail } })).id;
    const otherAddresses = await listActiveCustomerAddresses(otherTenant.tenantId, otherCustomerId);
    const otherProductUnit = await withTenantContext(otherTenant.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));

    const otherOrder = await submitOrder(
      otherTenant.tenantId,
      otherCustomerId,
      otherBuyerUserId,
      "Other Buyer",
      "BUYER_ADMIN",
      "CUSTOMER",
      { deliveryAddressId: otherAddresses[0].id, lines: [{ productUnitId: otherProductUnit.id, quantity: 1 }] }
    );
    if (!otherOrder.ok) throw new Error("setup failed");

    await expect(listOrderActivity(tenant.tenantId, otherOrder.order.id)).rejects.toThrow(OrderNotFoundForActivityError);
  });
});
