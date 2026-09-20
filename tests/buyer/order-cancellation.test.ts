import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import {
  OrderNotCancellableError,
  OrderNotFoundError,
  requestOrderCancellation,
  submitOrder,
} from "@/lib/domain/orders/order-service";
import { listActiveCustomerAddresses } from "@/lib/domain/customers/customer-address-service";

describe("requestOrderCancellation", () => {
  let tenant: SeededTenant;
  let buyerUserId: string;
  let customerId: string;
  let addressId: string;
  let seededProductUnitId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Mu", "mu-cancel", passwordHash);
    customerId = tenant.customers[0].id;
    buyerUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.customers[0].buyerEmail } })).id;

    const addresses = await listActiveCustomerAddresses(tenant.tenantId, customerId);
    addressId = addresses[0].id;

    const seededFixture = await withTenantContext(tenant.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));
    seededProductUnitId = seededFixture.id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  async function submitTestOrder() {
    const result = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: seededProductUnitId, quantity: 1 }],
    });
    if (!result.ok) throw new Error("Expected order submission to succeed in test setup.");
    return result.order;
  }

  it("cancels a SUBMITTED order immediately, no seller approval needed", async () => {
    const order = await submitTestOrder();

    const cancelled = await requestOrderCancellation(tenant.tenantId, customerId, buyerUserId, order.id, "Changed my mind");

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledBy).toBe("BUYER");
    expect(cancelled.cancelReason).toBe("Changed my mind");
  });

  it("writes an audit log entry for the cancellation", async () => {
    const order = await submitTestOrder();
    await requestOrderCancellation(tenant.tenantId, customerId, buyerUserId, order.id, "No longer needed");

    const entries = await withTenantContext(tenant.tenantId, (tx) =>
      tx.auditLogEntry.findMany({ where: { entityType: "Order", entityId: order.id }, orderBy: { createdAt: "asc" } })
    );
    const cancelEntry = entries.find((e) => e.action === "UPDATE" && e.reason === "No longer needed");
    expect(cancelEntry).toBeDefined();
    expect(cancelEntry?.actorUserId).toBe(buyerUserId);
    expect(cancelEntry?.actingContext).toBe("CUSTOMER");
  });

  it("rejects cancelling an order that is already CONFIRMED", async () => {
    const order = await submitTestOrder();
    await withTenantContext(tenant.tenantId, (tx) =>
      tx.order.update({ where: { id: order.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } })
    );

    await expect(
      requestOrderCancellation(tenant.tenantId, customerId, buyerUserId, order.id, "Too late")
    ).rejects.toBeInstanceOf(OrderNotCancellableError);

    const stillConfirmed = await withTenantContext(tenant.tenantId, (tx) =>
      tx.order.findUniqueOrThrow({ where: { id: order.id } })
    );
    expect(stillConfirmed.status).toBe("CONFIRMED");
  });

  it("rejects cancelling an order that is already CANCELLED", async () => {
    const order = await submitTestOrder();
    await requestOrderCancellation(tenant.tenantId, customerId, buyerUserId, order.id);

    await expect(requestOrderCancellation(tenant.tenantId, customerId, buyerUserId, order.id)).rejects.toBeInstanceOf(
      OrderNotCancellableError
    );
  });

  it("throws OrderNotFoundError for a nonexistent order id", async () => {
    await expect(
      requestOrderCancellation(tenant.tenantId, customerId, buyerUserId, "00000000-0000-0000-0000-000000000000")
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("cannot be used to cancel another customer's order", async () => {
    const order = await submitTestOrder();
    const otherCustomerId = tenant.customers[1].id;

    await expect(
      requestOrderCancellation(tenant.tenantId, otherCustomerId, buyerUserId, order.id)
    ).rejects.toBeInstanceOf(OrderNotFoundError);

    const stillSubmitted = await withTenantContext(tenant.tenantId, (tx) =>
      tx.order.findUniqueOrThrow({ where: { id: order.id } })
    );
    expect(stillSubmitted.status).toBe("SUBMITTED");
  });
});
