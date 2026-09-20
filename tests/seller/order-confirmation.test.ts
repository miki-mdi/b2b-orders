import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { submitOrder } from "@/lib/domain/orders/order-service";
import { confirmOrder } from "@/lib/domain/orders/order-fulfillment-service";
import { listActiveCustomerAddresses } from "@/lib/domain/customers/customer-address-service";
import { computeOrderTotals, computeSubmittedOrderTotals, type OrderLineForTotals } from "@/lib/domain/orders/order-totals";

describe("confirmOrder", () => {
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
    tenant = await seedTenant("Omicron", "omicron-confirm", passwordHash);
    otherTenant = await seedTenant("Pi", "pi-confirm", passwordHash);
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

  async function submitTestOrder(quantity: number) {
    const result = await submitOrder(tenant.tenantId, customerId, buyerUserId, "Test Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: seededProductUnitId, quantity }],
    });
    if (!result.ok) throw new Error("Expected order submission to succeed in test setup.");
    return result.order;
  }

  it("confirms an order with no adjustments, requiring no reason", async () => {
    const order = await submitTestOrder(5);
    const lineId = order.lines[0].id;

    const result = await confirmOrder(tenant.tenantId, actorUserId, order.id, [{ orderLineId: lineId, confirmedQty: 5 }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.status).toBe("CONFIRMED");
    expect(result.order.confirmedAt).not.toBeNull();
    expect(Number(result.order.lines[0].confirmedQty)).toBe(5);

    // No adjustment -> no OrderLine audit entry, only the order-level status change.
    const entries = await withTenantContext(tenant.tenantId, (tx) =>
      tx.auditLogEntry.findMany({ where: { entityType: "OrderLine", entityId: lineId } })
    );
    expect(entries).toHaveLength(0);
  });

  it("confirms a partial quantity with a required reason, preserving requestedQty", async () => {
    const order = await submitTestOrder(10);
    const lineId = order.lines[0].id;

    const result = await confirmOrder(tenant.tenantId, actorUserId, order.id, [
      { orderLineId: lineId, confirmedQty: 6, reason: "Out of stock" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const line = result.order.lines[0];
    expect(Number(line.requestedQty)).toBe(10); // never rewritten
    expect(Number(line.confirmedQty)).toBe(6);
    expect(line.unavailableReason).toBeNull(); // partial, not fully unavailable

    const entry = await withTenantContext(tenant.tenantId, (tx) =>
      tx.auditLogEntry.findFirstOrThrow({ where: { entityType: "OrderLine", entityId: lineId } })
    );
    expect(entry.fieldName).toBe("confirmedQty");
    expect(entry.oldValue).toBe(JSON.stringify(10));
    expect(entry.newValue).toBe(JSON.stringify(6));
    expect(entry.reason).toBe("Out of stock");
    expect(entry.actingContext).toBe("TENANT");
    expect(entry.actorUserId).toBe(actorUserId);
  });

  it("confirming zero quantity marks the line unavailable with the given reason", async () => {
    const order = await submitTestOrder(4);
    const lineId = order.lines[0].id;

    const result = await confirmOrder(tenant.tenantId, actorUserId, order.id, [
      { orderLineId: lineId, confirmedQty: 0, reason: "No stock at all" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const line = result.order.lines[0];
    expect(Number(line.confirmedQty)).toBe(0);
    expect(line.unavailableReason).toBe("No stock at all");
  });

  it("rejects a confirmedQty greater than requestedQty", async () => {
    const order = await submitTestOrder(3);
    const lineId = order.lines[0].id;

    const result = await confirmOrder(tenant.tenantId, actorUserId, order.id, [
      { orderLineId: lineId, confirmedQty: 5, reason: "Trying to overrule" },
    ]);

    expect(result).toEqual({ ok: false, reason: "LINE_ISSUES", lineIssues: [{ orderLineId: lineId, issue: "EXCEEDS_REQUESTED_QTY" }] });

    const stillSubmitted = await withTenantContext(tenant.tenantId, (tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }));
    expect(stillSubmitted.status).toBe("SUBMITTED");
  });

  it("rejects a changed quantity with no reason given", async () => {
    const order = await submitTestOrder(8);
    const lineId = order.lines[0].id;

    const result = await confirmOrder(tenant.tenantId, actorUserId, order.id, [{ orderLineId: lineId, confirmedQty: 3 }]);

    expect(result).toEqual({ ok: false, reason: "LINE_ISSUES", lineIssues: [{ orderLineId: lineId, issue: "REASON_REQUIRED" }] });
  });

  it("rejects a negative confirmedQty even bypassing the form schema", async () => {
    const order = await submitTestOrder(2);
    const lineId = order.lines[0].id;

    const result = await confirmOrder(tenant.tenantId, actorUserId, order.id, [
      { orderLineId: lineId, confirmedQty: -1, reason: "invalid" },
    ]);

    expect(result).toEqual({ ok: false, reason: "LINE_ISSUES", lineIssues: [{ orderLineId: lineId, issue: "NEGATIVE_QTY" }] });
  });

  it("rejects when a line is left out of the confirmation submission", async () => {
    const order = await submitTestOrder(2);
    const result = await confirmOrder(tenant.tenantId, actorUserId, order.id, []);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("LINE_ISSUES");
    if (result.reason === "LINE_ISSUES") {
      expect(result.lineIssues[0].issue).toBe("LINE_NOT_FOUND");
    }
  });

  it("rejects confirming an order that is not SUBMITTED", async () => {
    const order = await submitTestOrder(2);
    await withTenantContext(tenant.tenantId, (tx) => tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } }));

    const result = await confirmOrder(tenant.tenantId, actorUserId, order.id, [
      { orderLineId: order.lines[0].id, confirmedQty: 2 },
    ]);
    expect(result).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
  });

  it("returns ORDER_NOT_FOUND for a nonexistent order", async () => {
    const result = await confirmOrder(tenant.tenantId, actorUserId, "00000000-0000-0000-0000-000000000000", []);
    expect(result).toEqual({ ok: false, reason: "ORDER_NOT_FOUND" });
  });

  it("cannot confirm another tenant's order", async () => {
    const order = await submitTestOrder(2);
    const result = await confirmOrder(otherTenant.tenantId, actorUserId, order.id, [
      { orderLineId: order.lines[0].id, confirmedQty: 2 },
    ]);
    expect(result).toEqual({ ok: false, reason: "ORDER_NOT_FOUND" });

    const stillSubmitted = await withTenantContext(tenant.tenantId, (tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }));
    expect(stillSubmitted.status).toBe("SUBMITTED");
  });

  it("confirmed totals reflect confirmedQty while submitted totals stay at the original requestedQty", async () => {
    const order = await submitTestOrder(10);
    const lineId = order.lines[0].id;
    const result = await confirmOrder(tenant.tenantId, actorUserId, order.id, [
      { orderLineId: lineId, confirmedQty: 4, reason: "Partial stock" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const lineInputs: OrderLineForTotals[] = result.order.lines.map((line) => ({
      requestedQty: Number(line.requestedQty),
      confirmedQty: line.confirmedQty ? Number(line.confirmedQty) : null,
      unitPriceAtOrderTime: Number(line.unitPriceAtOrderTime),
      discountPercentAtOrderTime: line.discountPercentAtOrderTime ? Number(line.discountPercentAtOrderTime) : null,
      vatRateAtOrderTime: Number(line.vatRateAtOrderTime),
    }));

    const submittedTotals = computeSubmittedOrderTotals(lineInputs);
    const confirmedTotals = computeOrderTotals(lineInputs);

    expect(submittedTotals.subtotal).toBe(1000); // 10 * 100
    expect(confirmedTotals.subtotal).toBe(400); // 4 * 100
    expect(confirmedTotals.subtotal).not.toBe(submittedTotals.subtotal);
  });
});
