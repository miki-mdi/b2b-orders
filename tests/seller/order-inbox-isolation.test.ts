import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { getOrderForTenant, listOrdersForTenant, submitOrder } from "@/lib/domain/orders/order-service";
import { confirmOrder, advanceOrderStatus } from "@/lib/domain/orders/order-fulfillment-service";
import { assignDriverToOrder } from "@/lib/domain/orders/driver-assignment-service";
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

  // Phase 1F-B1: role-based order-read status scoping (src/lib/auth/permissions.ts).
  // alphaOrderId is SUBMITTED - outside both Warehouse's and Driver's scope.
  it("getOrderForTenant returns null (not the order) when its status is outside allowedStatuses", async () => {
    const asWarehouse = await getOrderForTenant(alpha.tenantId, alphaOrderId, ["CONFIRMED", "PICKING", "READY"]);
    expect(asWarehouse).toBeNull();

    const asAdmin = await getOrderForTenant(alpha.tenantId, alphaOrderId, null);
    expect(asAdmin?.id).toBe(alphaOrderId);
  });

  it("listOrdersForTenant's statusIn scopes the whole list, independent of the status dropdown filter", async () => {
    const scoped = await listOrdersForTenant(alpha.tenantId, { statusIn: ["CONFIRMED", "PICKING", "READY"] });
    expect(scoped.map((o) => o.id)).not.toContain(alphaOrderId);

    const unscoped = await listOrdersForTenant(alpha.tenantId, { statusIn: null });
    expect(unscoped.map((o) => o.id)).toContain(alphaOrderId);
  });

  it("an explicit status filter outside statusIn's scope returns zero rows rather than widening the scope", async () => {
    const result = await listOrdersForTenant(alpha.tenantId, {
      status: "SUBMITTED",
      statusIn: ["CONFIRMED", "PICKING", "READY"],
    });
    expect(result).toHaveLength(0);
  });
});

// Phase 1F-B3: Delivery Driver order-read scoping via assignedDriverMembershipId,
// additive to (never a replacement for) Phase 1F-B1's status-based scoping.
describe("driver order-read scoping (Phase 1F-B3)", () => {
  let tenant: SeededTenant;
  let actorUserId: string;
  let buyerUserId: string;
  let addressId: string;
  let seededProductUnitId: string;
  let driverAMembershipId: string;
  let driverBMembershipId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Omega", "omega-driver-scope", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
    buyerUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.customers[0].buyerEmail } })).id;
    const addresses = await listActiveCustomerAddresses(tenant.tenantId, tenant.customers[0].id);
    addressId = addresses[0].id;
    seededProductUnitId = (await withTenantContext(tenant.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}))).id;

    const driverAUser = await prismaBase.user.create({
      data: { email: "driver-a@omega-driver-scope.test", passwordHash, name: "Omega Driver A" },
    });
    const driverBUser = await prismaBase.user.create({
      data: { email: "driver-b@omega-driver-scope.test", passwordHash, name: "Omega Driver B" },
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

  async function orderInStatus(status: "SUBMITTED" | "CONFIRMED" | "PICKING" | "READY") {
    const submitted = await submitOrder(tenant.tenantId, tenant.customers[0].id, buyerUserId, "Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: seededProductUnitId, quantity: 1 }],
    });
    if (!submitted.ok) throw new Error("setup: submission failed");
    if (status === "SUBMITTED") return submitted.order;

    const confirmed = await confirmOrder(tenant.tenantId, actorUserId, submitted.order.id, [
      { orderLineId: submitted.order.lines[0].id, confirmedQty: 1 },
    ]);
    if (!confirmed.ok) throw new Error("setup: confirmation failed");
    if (status === "CONFIRMED") return confirmed.order;

    const picking = await advanceOrderStatus(tenant.tenantId, actorUserId, confirmed.order.id, "PICKING");
    if (!picking.ok) throw new Error("setup: picking failed");
    if (status === "PICKING") return picking.order;

    const ready = await advanceOrderStatus(tenant.tenantId, actorUserId, picking.order.id, "READY");
    if (!ready.ok) throw new Error("setup: ready failed");
    return ready.order;
  }

  it("a driver sees their own assigned order once it's READY", async () => {
    const order = await orderInStatus("READY");
    await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, driverAMembershipId);

    const result = await getOrderForTenant(tenant.tenantId, order.id, ["READY", "OUT_FOR_DELIVERY", "DELIVERED"], {
      membershipId: driverAMembershipId,
    });
    expect(result?.id).toBe(order.id);
  });

  it("a different driver cannot see it", async () => {
    const order = await orderInStatus("READY");
    await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, driverAMembershipId);

    const result = await getOrderForTenant(tenant.tenantId, order.id, ["READY", "OUT_FOR_DELIVERY", "DELIVERED"], {
      membershipId: driverBMembershipId,
    });
    expect(result).toBeNull();
  });

  it("an unassigned order is invisible to any driver, even in scope status", async () => {
    const order = await orderInStatus("READY");

    const result = await getOrderForTenant(tenant.tenantId, order.id, ["READY", "OUT_FOR_DELIVERY", "DELIVERED"], {
      membershipId: driverAMembershipId,
    });
    expect(result).toBeNull();
  });

  it("an order assigned early (still SUBMITTED/CONFIRMED/PICKING) is invisible to its driver until READY", async () => {
    for (const status of ["SUBMITTED", "CONFIRMED", "PICKING"] as const) {
      const order = await orderInStatus(status);
      await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, driverAMembershipId);

      // The status-scope argument mirrors what orderReadStatusScopeFor("DELIVERY_DRIVER") returns.
      const result = await getOrderForTenant(tenant.tenantId, order.id, ["READY", "OUT_FOR_DELIVERY", "DELIVERED"], {
        membershipId: driverAMembershipId,
      });
      expect(result).toBeNull();
    }
  });

  it("listOrdersForTenant's driverScope narrows the inbox to only that driver's assigned orders", async () => {
    const assignedToA = await orderInStatus("READY");
    await assignDriverToOrder(tenant.tenantId, actorUserId, assignedToA.id, driverAMembershipId);
    const assignedToB = await orderInStatus("READY");
    await assignDriverToOrder(tenant.tenantId, actorUserId, assignedToB.id, driverBMembershipId);
    const unassigned = await orderInStatus("READY");

    const driverAInbox = await listOrdersForTenant(tenant.tenantId, {
      statusIn: ["READY", "OUT_FOR_DELIVERY", "DELIVERED"],
      driverScope: { membershipId: driverAMembershipId },
    });
    const ids = driverAInbox.map((o) => o.id);
    expect(ids).toContain(assignedToA.id);
    expect(ids).not.toContain(assignedToB.id);
    expect(ids).not.toContain(unassigned.id);
  });

  it("Warehouse Worker's own scope (no driverScope passed) is unaffected by any driver assignment", async () => {
    const order = await orderInStatus("READY");
    await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, driverAMembershipId);

    // Warehouse Worker never passes driverScope - this call shape is exactly
    // what its pages/actions use (orderReadStatusScopeFor("WAREHOUSE_WORKER")).
    const result = await getOrderForTenant(tenant.tenantId, order.id, ["CONFIRMED", "PICKING", "READY"]);
    expect(result?.id).toBe(order.id);

    const warehouseInbox = await listOrdersForTenant(tenant.tenantId, { statusIn: ["CONFIRMED", "PICKING", "READY"] });
    expect(warehouseInbox.map((o) => o.id)).toContain(order.id);
  });

  it("Seller Admin / Sales Rep's unrestricted read (no driverScope) still sees every order regardless of assignment", async () => {
    const order = await orderInStatus("SUBMITTED");
    await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, driverAMembershipId);

    const result = await getOrderForTenant(tenant.tenantId, order.id, null);
    expect(result?.id).toBe(order.id);
  });
});
