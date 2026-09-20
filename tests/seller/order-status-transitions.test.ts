import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { submitOrder } from "@/lib/domain/orders/order-service";
import { advanceOrderStatus, confirmOrder } from "@/lib/domain/orders/order-fulfillment-service";
import { listActiveCustomerAddresses } from "@/lib/domain/customers/customer-address-service";

describe("advanceOrderStatus", () => {
  let tenant: SeededTenant;
  let otherTenant: SeededTenant;
  let actorUserId: string;
  let buyerUserId: string;
  let customerId: string;
  let addressId: string;
  let seededProductUnitId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Rho", "rho-transitions", passwordHash);
    otherTenant = await seedTenant("Sigma", "sigma-transitions", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
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

  async function submitAndConfirmOrder() {
    const submitted = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: seededProductUnitId, quantity: 2 }],
    });
    if (!submitted.ok) throw new Error("setup: submission failed");
    const confirmed = await confirmOrder(tenant.tenantId, actorUserId, submitted.order.id, [
      { orderLineId: submitted.order.lines[0].id, confirmedQty: 2 },
    ]);
    if (!confirmed.ok) throw new Error("setup: confirmation failed");
    return confirmed.order;
  }

  it("progresses CONFIRMED -> PICKING -> READY -> OUT_FOR_DELIVERY -> DELIVERED", async () => {
    const order = await submitAndConfirmOrder();

    const picking = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "PICKING");
    expect(picking.ok && picking.order.status).toBe("PICKING");

    const ready = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "READY");
    expect(ready.ok && ready.order.status).toBe("READY");

    const outForDelivery = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "OUT_FOR_DELIVERY");
    expect(outForDelivery.ok && outForDelivery.order.status).toBe("OUT_FOR_DELIVERY");

    const delivered = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "DELIVERED");
    expect(delivered.ok).toBe(true);
    if (delivered.ok) {
      expect(delivered.order.status).toBe("DELIVERED");
      expect(delivered.order.deliveredAt).not.toBeNull();
    }
  });

  it("records delivered timestamp only once DELIVERED is actually reached, never before", async () => {
    const order = await submitAndConfirmOrder();
    expect(order.deliveredAt).toBeNull();

    const picking = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "PICKING");
    expect(picking.ok && picking.order.deliveredAt).toBeNull();
  });

  it("writes an audit entry with the actor for each transition", async () => {
    const order = await submitAndConfirmOrder();
    await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "PICKING");

    const entry = await withTenantContext(tenant.tenantId, (tx) =>
      tx.auditLogEntry.findFirstOrThrow({
        where: { entityType: "Order", entityId: order.id, fieldName: "status", newValue: JSON.stringify("PICKING") },
      })
    );
    expect(entry.actorUserId).toBe(actorUserId);
    expect(entry.oldValue).toBe(JSON.stringify("CONFIRMED"));
  });

  it("rejects skipping a stage (SUBMITTED straight to PICKING)", async () => {
    const submitted = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: seededProductUnitId, quantity: 1 }],
    });
    if (!submitted.ok) throw new Error("setup: submission failed");

    const result = await advanceOrderStatus(tenant.tenantId, actorUserId, submitted.order.id, "PICKING");
    expect(result).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
  });

  it("rejects moving a DELIVERED order backward", async () => {
    const order = await submitAndConfirmOrder();
    await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "PICKING");
    await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "READY");
    await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "OUT_FOR_DELIVERY");
    const delivered = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "DELIVERED");
    expect(delivered.ok).toBe(true);

    const backward = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "PICKING");
    expect(backward).toEqual({ ok: false, reason: "INVALID_TRANSITION" });

    const stillDelivered = await withTenantContext(tenant.tenantId, (tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }));
    expect(stillDelivered.status).toBe("DELIVERED");
  });

  it("a CANCELLED order cannot be confirmed or advanced", async () => {
    const submitted = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: seededProductUnitId, quantity: 1 }],
    });
    if (!submitted.ok) throw new Error("setup: submission failed");
    await withTenantContext(tenant.tenantId, (tx) => tx.order.update({ where: { id: submitted.order.id }, data: { status: "CANCELLED" } }));

    const confirmResult = await confirmOrder(tenant.tenantId, actorUserId, submitted.order.id, [
      { orderLineId: submitted.order.lines[0].id, confirmedQty: 1 },
    ]);
    expect(confirmResult).toEqual({ ok: false, reason: "INVALID_TRANSITION" });

    const advanceResult = await advanceOrderStatus(tenant.tenantId, actorUserId, submitted.order.id, "PICKING");
    expect(advanceResult).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
  });

  it("Tenant A seller cannot read, confirm, or advance Tenant B's order", async () => {
    const order = await submitAndConfirmOrder();

    const otherTenantAdvance = await advanceOrderStatus(otherTenant.tenantId, actorUserId, order.id, "PICKING");
    expect(otherTenantAdvance).toEqual({ ok: false, reason: "ORDER_NOT_FOUND" });

    const stillConfirmed = await withTenantContext(tenant.tenantId, (tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }));
    expect(stillConfirmed.status).toBe("CONFIRMED");
  });

  it("RLS alone (bypassing Layer 2) blocks a cross-tenant status update", async () => {
    const order = await submitAndConfirmOrder();

    const result = await prismaBase.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${otherTenant.tenantId}, true)`;
      return tx.order.updateMany({ where: { id: order.id }, data: { status: "PICKING" } });
    });
    expect(result.count).toBe(0);

    const stillConfirmed = await withTenantContext(tenant.tenantId, (tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }));
    expect(stillConfirmed.status).toBe("CONFIRMED");
  });

  it("audit records for order transitions are tenant-scoped", async () => {
    const order = await submitAndConfirmOrder();
    await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "PICKING");

    const otherTenantAudit = await withTenantContext(otherTenant.tenantId, (tx) =>
      tx.auditLogEntry.findMany({ where: { entityType: "Order", entityId: order.id } })
    );
    expect(otherTenantAudit).toHaveLength(0);
  });
});
