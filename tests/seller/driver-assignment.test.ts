import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { submitOrder } from "@/lib/domain/orders/order-service";
import { confirmOrder } from "@/lib/domain/orders/order-fulfillment-service";
import {
  assignDriverToOrder,
  getOwnActiveTenantMembershipId,
  listTenantDriverOptions,
} from "@/lib/domain/orders/driver-assignment-service";
import { listActiveCustomerAddresses } from "@/lib/domain/customers/customer-address-service";

describe("driver assignment (Phase 1F-B3)", () => {
  let tenant: SeededTenant;
  let otherTenant: SeededTenant;
  let actorUserId: string;
  let buyerUserId: string;
  let addressId: string;
  let seededProductUnitId: string;

  let driverMembershipId: string;
  let inactiveDriverMembershipId: string;
  let salesRepMembershipId: string;
  let otherTenantDriverMembershipId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Tau", "tau-driver-assign", passwordHash);
    otherTenant = await seedTenant("Upsilon", "upsilon-driver-assign", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
    buyerUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.customers[0].buyerEmail } })).id;

    const addresses = await listActiveCustomerAddresses(tenant.tenantId, tenant.customers[0].id);
    addressId = addresses[0].id;
    const seededFixture = await withTenantContext(tenant.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));
    seededProductUnitId = seededFixture.id;

    const driverUser = await prismaBase.user.create({
      data: { email: "driver-one@tau-driver-assign.test", passwordHash, name: "Tau Driver One" },
    });
    const inactiveDriverUser = await prismaBase.user.create({
      data: { email: "driver-inactive@tau-driver-assign.test", passwordHash, name: "Tau Inactive Driver" },
    });
    const salesRepUser = await prismaBase.user.create({
      data: { email: "sales-rep@tau-driver-assign.test", passwordHash, name: "Tau Sales Rep" },
    });
    const otherTenantDriverUser = await prismaBase.user.create({
      data: { email: "driver@upsilon-driver-assign.test", passwordHash, name: "Upsilon Driver" },
    });

    driverMembershipId = (
      await withTenantContext(tenant.tenantId, (tx) =>
        tx.tenantMembership.create({ data: { userId: driverUser.id, tenantId: tenant.tenantId, role: "DELIVERY_DRIVER" } })
      )
    ).id;
    inactiveDriverMembershipId = (
      await withTenantContext(tenant.tenantId, (tx) =>
        tx.tenantMembership.create({
          data: { userId: inactiveDriverUser.id, tenantId: tenant.tenantId, role: "DELIVERY_DRIVER", isActive: false },
        })
      )
    ).id;
    salesRepMembershipId = (
      await withTenantContext(tenant.tenantId, (tx) =>
        tx.tenantMembership.create({ data: { userId: salesRepUser.id, tenantId: tenant.tenantId, role: "SALES_REP" } })
      )
    ).id;
    otherTenantDriverMembershipId = (
      await withTenantContext(otherTenant.tenantId, (tx) =>
        tx.tenantMembership.create({
          data: { userId: otherTenantDriverUser.id, tenantId: otherTenant.tenantId, role: "DELIVERY_DRIVER" },
        })
      )
    ).id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  async function submitFreshOrder() {
    const submitted = await submitOrder(tenant.tenantId, tenant.customers[0].id, buyerUserId, "Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: seededProductUnitId, quantity: 1 }],
    });
    if (!submitted.ok) throw new Error("setup: submission failed");
    return submitted.order;
  }

  describe("getOwnActiveTenantMembershipId", () => {
    it("resolves the id of an active DELIVERY_DRIVER membership", async () => {
      const driverUser = await prismaBase.user.findUniqueOrThrow({ where: { email: "driver-one@tau-driver-assign.test" } });
      const result = await getOwnActiveTenantMembershipId(tenant.tenantId, driverUser.id);
      expect(result).toBe(driverMembershipId);
    });

    it("returns null for a membership with a different role, even though it's active", async () => {
      const salesRepUser = await prismaBase.user.findUniqueOrThrow({ where: { email: "sales-rep@tau-driver-assign.test" } });
      const result = await getOwnActiveTenantMembershipId(tenant.tenantId, salesRepUser.id);
      expect(result).toBeNull();
    });

    it("returns null for an inactive DELIVERY_DRIVER membership", async () => {
      const inactiveUser = await prismaBase.user.findUniqueOrThrow({ where: { email: "driver-inactive@tau-driver-assign.test" } });
      const result = await getOwnActiveTenantMembershipId(tenant.tenantId, inactiveUser.id);
      expect(result).toBeNull();
    });

    it("returns null for a user with no membership in this tenant at all", async () => {
      const result = await getOwnActiveTenantMembershipId(tenant.tenantId, actorUserId + "-does-not-exist");
      expect(result).toBeNull();
    });
  });

  describe("listTenantDriverOptions", () => {
    it("lists only active DELIVERY_DRIVER memberships for this tenant", async () => {
      const options = await listTenantDriverOptions(tenant.tenantId);
      expect(options.map((o) => o.membershipId)).toContain(driverMembershipId);
      expect(options.map((o) => o.membershipId)).not.toContain(inactiveDriverMembershipId);
      expect(options.map((o) => o.membershipId)).not.toContain(salesRepMembershipId);
    });
  });

  describe("assignDriverToOrder", () => {
    it("assigns a driver to a SUBMITTED order and audits the change", async () => {
      const order = await submitFreshOrder();
      const result = await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, driverMembershipId);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.order.assignedDriverMembershipId).toBe(driverMembershipId);

      const entry = await withTenantContext(tenant.tenantId, (tx) =>
        tx.auditLogEntry.findFirstOrThrow({
          where: { entityType: "Order", entityId: order.id, fieldName: "assignedDriverMembershipId" },
        })
      );
      expect(entry.oldValue).toBe(JSON.stringify(null));
      expect(entry.newValue).toBe(JSON.stringify(driverMembershipId));
      expect(entry.actorUserId).toBe(actorUserId);
    });

    it("reassigns from one driver to another", async () => {
      const order = await submitFreshOrder();
      await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, driverMembershipId);

      const otherDriverUser = await prismaBase.user.create({
        data: { email: `driver-two-${order.id}@tau-driver-assign.test`, passwordHash: "x", name: "Tau Driver Two" },
      });
      const otherDriverMembership = await withTenantContext(tenant.tenantId, (tx) =>
        tx.tenantMembership.create({ data: { userId: otherDriverUser.id, tenantId: tenant.tenantId, role: "DELIVERY_DRIVER" } })
      );

      const result = await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, otherDriverMembership.id);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.order.assignedDriverMembershipId).toBe(otherDriverMembership.id);
    });

    it("unassigns a driver (targetMembershipId: null) and audits it", async () => {
      const order = await submitFreshOrder();
      await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, driverMembershipId);

      const result = await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, null);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.order.assignedDriverMembershipId).toBeNull();

      const entry = await withTenantContext(tenant.tenantId, (tx) =>
        tx.auditLogEntry.findFirstOrThrow({
          where: {
            entityType: "Order",
            entityId: order.id,
            fieldName: "assignedDriverMembershipId",
            newValue: JSON.stringify(null),
          },
        })
      );
      expect(entry.oldValue).toBe(JSON.stringify(driverMembershipId));
    });

    it("allows assignment in every non-terminal status", async () => {
      const order = await submitFreshOrder();
      const confirmed = await confirmOrder(tenant.tenantId, actorUserId, order.id, [
        { orderLineId: order.lines[0].id, confirmedQty: 1 },
      ]);
      if (!confirmed.ok) throw new Error("setup: confirmation failed");

      const result = await assignDriverToOrder(tenant.tenantId, actorUserId, confirmed.order.id, driverMembershipId);
      expect(result.ok).toBe(true);
    });

    it("rejects assignment on a DELIVERED order", async () => {
      const order = await submitFreshOrder();
      await withTenantContext(tenant.tenantId, (tx) => tx.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } }));

      const result = await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, driverMembershipId);
      expect(result).toEqual({ ok: false, reason: "ORDER_TERMINAL" });
    });

    it("rejects assignment on a CANCELLED order", async () => {
      const order = await submitFreshOrder();
      await withTenantContext(tenant.tenantId, (tx) => tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } }));

      const result = await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, driverMembershipId);
      expect(result).toEqual({ ok: false, reason: "ORDER_TERMINAL" });
    });

    it("rejects an inactive driver membership as the target", async () => {
      const order = await submitFreshOrder();
      const result = await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, inactiveDriverMembershipId);
      expect(result).toEqual({ ok: false, reason: "DRIVER_NOT_FOUND_OR_INELIGIBLE" });
    });

    it("rejects a membership whose role is not DELIVERY_DRIVER as the target", async () => {
      const order = await submitFreshOrder();
      const result = await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, salesRepMembershipId);
      expect(result).toEqual({ ok: false, reason: "DRIVER_NOT_FOUND_OR_INELIGIBLE" });
    });

    it("rejects a driver membership belonging to a different tenant", async () => {
      const order = await submitFreshOrder();
      const result = await assignDriverToOrder(tenant.tenantId, actorUserId, order.id, otherTenantDriverMembershipId);
      expect(result).toEqual({ ok: false, reason: "DRIVER_NOT_FOUND_OR_INELIGIBLE" });

      const stillUnassigned = await withTenantContext(tenant.tenantId, (tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }));
      expect(stillUnassigned.assignedDriverMembershipId).toBeNull();
    });

    it("returns ORDER_NOT_FOUND for another tenant's order id", async () => {
      const order = await submitFreshOrder();
      const result = await assignDriverToOrder(otherTenant.tenantId, actorUserId, order.id, null);
      expect(result).toEqual({ ok: false, reason: "ORDER_NOT_FOUND" });
    });
  });

  describe("composite tenant-safe FK (database-level enforcement)", () => {
    it("Postgres rejects a cross-tenant assignedDriverMembershipId even bypassing application validation", async () => {
      const order = await submitFreshOrder();

      await expect(
        prismaBase.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant.tenantId}, true)`;
          return tx.order.update({
            where: { id: order.id },
            data: { assignedDriverMembershipId: otherTenantDriverMembershipId },
          });
        })
      ).rejects.toThrow();

      const stillUnassigned = await withTenantContext(tenant.tenantId, (tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }));
      expect(stillUnassigned.assignedDriverMembershipId).toBeNull();
    });
  });
});
