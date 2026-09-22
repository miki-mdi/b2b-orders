import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { submitOrder } from "@/lib/domain/orders/order-service";
import { advanceOrderStatus, confirmOrder } from "@/lib/domain/orders/order-fulfillment-service";
import { assignDriverToOrder } from "@/lib/domain/orders/driver-assignment-service";
import { listActiveCustomerAddresses } from "@/lib/domain/customers/customer-address-service";

describe("advanceOrderStatus", () => {
  let tenant: SeededTenant;
  let otherTenant: SeededTenant;
  let actorUserId: string;
  let buyerUserId: string;
  let customerId: string;
  let addressId: string;
  let seededProductUnitId: string;

  let driverAMembershipId: string;
  let driverBMembershipId: string;

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

    const driverAUser = await prismaBase.user.create({
      data: { email: "driver-a@rho-transitions.test", passwordHash, name: "Rho Driver A" },
    });
    const driverBUser = await prismaBase.user.create({
      data: { email: "driver-b@rho-transitions.test", passwordHash, name: "Rho Driver B" },
    });
    driverAMembershipId = (
      await withTenantContext(tenant.tenantId, (tx) =>
        tx.tenantMembership.create({ data: { userId: driverAUser.id, tenantId: tenant.tenantId, role: "DELIVERY_DRIVER" } })
      )
    ).id;
    driverBMembershipId = (
      await withTenantContext(tenant.tenantId, (tx) =>
        tx.tenantMembership.create({ data: { userId: driverBUser.id, tenantId: tenant.tenantId, role: "DELIVERY_DRIVER" } })
      )
    ).id;
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

  // Phase 1F-B3: the Delivery Driver ownership invariant on advanceOrderStatus's
  // OUT_FOR_DELIVERY/DELIVERED transitions - enforced inside the same transaction
  // via options.requireDriverMembershipId, never trusting the UI to hide a button.
  describe("Delivery Driver ownership invariant", () => {
    async function progressToReady() {
      const order = await submitAndConfirmOrder();
      const picking = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "PICKING");
      if (!picking.ok) throw new Error("setup: picking failed");
      const ready = await advanceOrderStatus(tenant.tenantId, actorUserId, picking.order.id, "READY");
      if (!ready.ok) throw new Error("setup: ready failed");
      return ready.order;
    }

    it("the assigned driver can mark their own READY order OUT_FOR_DELIVERY", async () => {
      const order = await progressToReady();
      await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, driverAMembershipId);

      const result = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "OUT_FOR_DELIVERY", {
        requireDriverMembershipId: driverAMembershipId,
      });
      expect(result.ok && result.order.status).toBe("OUT_FOR_DELIVERY");
    });

    it("the assigned driver can mark their own OUT_FOR_DELIVERY order DELIVERED", async () => {
      const order = await progressToReady();
      await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, driverAMembershipId);
      const outForDelivery = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "OUT_FOR_DELIVERY", {
        requireDriverMembershipId: driverAMembershipId,
      });
      if (!outForDelivery.ok) throw new Error("setup: out for delivery failed");

      const result = await advanceOrderStatus(tenant.tenantId, actorUserId, outForDelivery.order.id, "DELIVERED", {
        requireDriverMembershipId: driverAMembershipId,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.order.status).toBe("DELIVERED");
        expect(result.order.deliveredAt).not.toBeNull();
      }
    });

    it("a different driver cannot mutate either transition via a crafted/direct call with a known orderId", async () => {
      const order = await progressToReady();
      await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, driverAMembershipId);

      const outForDelivery = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "OUT_FOR_DELIVERY", {
        requireDriverMembershipId: driverBMembershipId,
      });
      expect(outForDelivery).toEqual({ ok: false, reason: "NOT_ASSIGNED_DRIVER" });

      // Force the order into OUT_FOR_DELIVERY as the actual assigned driver, then
      // prove driver B still can't take it to DELIVERED either.
      const actuallyOutForDelivery = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "OUT_FOR_DELIVERY", {
        requireDriverMembershipId: driverAMembershipId,
      });
      if (!actuallyOutForDelivery.ok) throw new Error("setup: out for delivery failed");

      const delivered = await advanceOrderStatus(tenant.tenantId, actorUserId, actuallyOutForDelivery.order.id, "DELIVERED", {
        requireDriverMembershipId: driverBMembershipId,
      });
      expect(delivered).toEqual({ ok: false, reason: "NOT_ASSIGNED_DRIVER" });

      const stillOutForDelivery = await withTenantContext(tenant.tenantId, (tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }));
      expect(stillOutForDelivery.status).toBe("OUT_FOR_DELIVERY");
    });

    it("a driver cannot mutate an unassigned order", async () => {
      const order = await progressToReady();

      const result = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "OUT_FOR_DELIVERY", {
        requireDriverMembershipId: driverAMembershipId,
      });
      expect(result).toEqual({ ok: false, reason: "NOT_ASSIGNED_DRIVER" });
    });

    it("early assignment does not let the driver act while status is SUBMITTED/CONFIRMED/PICKING", async () => {
      const submitted = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", "CUSTOMER", {
        deliveryAddressId: addressId,
        lines: [{ productUnitId: seededProductUnitId, quantity: 1 }],
      });
      if (!submitted.ok) throw new Error("setup: submission failed");
      await assignDriverToOrder(tenant.tenantId, actorUserId, submitted.order.id, driverAMembershipId);

      // Still SUBMITTED: ownership matches, but the state machine itself rejects it.
      const whileSubmitted = await advanceOrderStatus(tenant.tenantId, actorUserId, submitted.order.id, "OUT_FOR_DELIVERY", {
        requireDriverMembershipId: driverAMembershipId,
      });
      expect(whileSubmitted).toEqual({ ok: false, reason: "INVALID_TRANSITION" });

      const confirmed = await confirmOrder(tenant.tenantId, actorUserId, submitted.order.id, [
        { orderLineId: submitted.order.lines[0].id, confirmedQty: 1 },
      ]);
      if (!confirmed.ok) throw new Error("setup: confirmation failed");
      const whileConfirmed = await advanceOrderStatus(tenant.tenantId, actorUserId, confirmed.order.id, "OUT_FOR_DELIVERY", {
        requireDriverMembershipId: driverAMembershipId,
      });
      expect(whileConfirmed).toEqual({ ok: false, reason: "INVALID_TRANSITION" });

      const picking = await advanceOrderStatus(tenant.tenantId, actorUserId, confirmed.order.id, "PICKING");
      if (!picking.ok) throw new Error("setup: picking failed");
      const whilePicking = await advanceOrderStatus(tenant.tenantId, actorUserId, picking.order.id, "OUT_FOR_DELIVERY", {
        requireDriverMembershipId: driverAMembershipId,
      });
      expect(whilePicking).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
    });

    it("Seller Admin retains existing transition behavior, unaffected by driver assignment", async () => {
      const order = await progressToReady();
      // No options passed at all - exactly how Seller Admin's Server Action calls it.
      const outForDelivery = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "OUT_FOR_DELIVERY");
      expect(outForDelivery.ok && outForDelivery.order.status).toBe("OUT_FOR_DELIVERY");

      const delivered = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "DELIVERED");
      expect(delivered.ok && delivered.order.status).toBe("DELIVERED");

      // Also true for an order assigned to someone else, or unassigned - Admin is unrestricted.
      const otherOrder = await progressToReady();
      await assignDriverToOrder(tenant.tenantId, actorUserId, otherOrder.id, driverBMembershipId);
      const adminOverride = await advanceOrderStatus(tenant.tenantId, actorUserId, otherOrder.id, "OUT_FOR_DELIVERY");
      expect(adminOverride.ok).toBe(true);
    });

    it("Warehouse Worker's PICKING/READY transitions remain unchanged, regardless of driver assignment", async () => {
      const order = await submitAndConfirmOrder();
      await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, driverAMembershipId);

      // Warehouse Worker never passes requireDriverMembershipId - this call
      // shape is exactly what its Server Action uses.
      const picking = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "PICKING");
      expect(picking.ok && picking.order.status).toBe("PICKING");

      const ready = await advanceOrderStatus(tenant.tenantId, actorUserId, order.id, "READY");
      expect(ready.ok && ready.order.status).toBe("READY");
    });
  });
});
