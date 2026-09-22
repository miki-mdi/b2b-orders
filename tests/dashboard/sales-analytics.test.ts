import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { submitOrder } from "@/lib/domain/orders/order-service";
import { confirmOrder } from "@/lib/domain/orders/order-fulfillment-service";
import { listActiveCustomerAddresses } from "@/lib/domain/customers/customer-address-service";
import { getSalesAnalytics } from "@/lib/domain/dashboard/sales-analytics-service";
import type { DashboardDateRange } from "@/lib/domain/dashboard/date-range";

// A fixed historical window, chosen so it can never collide with
// seedTenant's own sample order (submittedAt = real "now" at seed time) or
// with whatever day the test happens to run on.
const JANUARY_2020: DashboardDateRange = { option: "custom", from: new Date("2020-01-01T00:00:00Z"), to: new Date("2020-02-01T00:00:00Z") };

async function addSecondProductUnit(tenantId: string, slug: string, price: number) {
  return withTenantContext(tenantId, async (tx) => {
    const priceList = await tx.priceList.findFirstOrThrow({ where: { isDefault: true } });
    const category = await tx.category.findFirstOrThrow({});
    const unit = await tx.unitOfMeasure.findFirstOrThrow({});
    const product = await tx.product.create({
      data: { tenantId, categoryId: category.id, nameMk: "Гаџет", nameEn: "Gadget", sku: `${slug.toUpperCase()}-GADGET` },
    });
    const productUnit = await tx.productUnit.create({
      data: { tenantId, productId: product.id, unitOfMeasureId: unit.id, sku: `${slug.toUpperCase()}-GADGET-PC`, label: "Piece" },
    });
    await tx.priceListItem.create({ data: { priceListId: priceList.id, productUnitId: productUnit.id, price } });
    return productUnit;
  });
}

async function setSubmittedAt(tenantId: string, orderId: string, date: Date) {
  await withTenantContext(tenantId, (tx) => tx.order.update({ where: { id: orderId }, data: { submittedAt: date } }));
}

describe("dashboard sales analytics: submitted order value and top products", () => {
  let alpha: SeededTenant;
  let beta: SeededTenant;
  let alphaWidgetUnitId: string;
  let alphaGadgetUnitId: string;
  let orderAId: string;
  let orderBId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    alpha = await seedTenant("Phi", "phi-analytics", passwordHash);
    beta = await seedTenant("Chi", "chi-analytics", passwordHash);

    const alphaWidget = await withTenantContext(alpha.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));
    alphaWidgetUnitId = alphaWidget.id;
    const gadget = await addSecondProductUnit(alpha.tenantId, "phi-analytics", 50);
    alphaGadgetUnitId = gadget.id;

    const alphaBuyerUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: alpha.customers[0].buyerEmail } })).id;
    const alphaAddresses = await listActiveCustomerAddresses(alpha.tenantId, alpha.customers[0].id);
    const addressId = alphaAddresses[0].id;

    // Order A: 2020-01-10, 3x Widget @100, 18% VAT -> subtotal 300, vat 54, total 354.
    const orderA = await submitOrder(alpha.tenantId, alpha.customers[0].id, alphaBuyerUserId, "Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: alphaWidgetUnitId, quantity: 3 }],
    });
    if (!orderA.ok) throw new Error("setup: order A failed");
    orderAId = orderA.order.id;
    await setSubmittedAt(alpha.tenantId, orderAId, new Date("2020-01-10T12:00:00Z"));

    // Order B: 2020-01-15, 4x Widget requested -> submitted total 472, then
    // confirmed down to 2 - the submitted total must NOT change afterwards.
    const orderB = await submitOrder(alpha.tenantId, alpha.customers[0].id, alphaBuyerUserId, "Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: alphaWidgetUnitId, quantity: 4 }],
    });
    if (!orderB.ok) throw new Error("setup: order B failed");
    orderBId = orderB.order.id;
    await setSubmittedAt(alpha.tenantId, orderBId, new Date("2020-01-15T12:00:00Z"));
    const sellerAdminUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: alpha.sellerAdminEmail } })).id;
    const confirmResult = await confirmOrder(alpha.tenantId, sellerAdminUserId, orderBId, [
      { orderLineId: orderB.order.lines[0].id, confirmedQty: 2, reason: "Partial stock available" },
    ]);
    if (!confirmResult.ok) throw new Error("setup: confirming order B failed");

    // Order C: 2020-01-20, cancelled - must be excluded even though it's
    // within the date range and would otherwise count.
    const orderC = await submitOrder(alpha.tenantId, alpha.customers[0].id, alphaBuyerUserId, "Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: alphaWidgetUnitId, quantity: 2 }],
    });
    if (!orderC.ok) throw new Error("setup: order C failed");
    await setSubmittedAt(alpha.tenantId, orderC.order.id, new Date("2020-01-20T12:00:00Z"));
    await withTenantContext(alpha.tenantId, (tx) => tx.order.update({ where: { id: orderC.order.id }, data: { status: "CANCELLED" } }));

    // Order D: 2020-02-05, outside the January window - must be excluded by date range alone.
    const orderD = await submitOrder(alpha.tenantId, alpha.customers[0].id, alphaBuyerUserId, "Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: alphaWidgetUnitId, quantity: 1 }],
    });
    if (!orderD.ok) throw new Error("setup: order D failed");
    await setSubmittedAt(alpha.tenantId, orderD.order.id, new Date("2020-02-05T12:00:00Z"));

    // Order E: 2020-01-25, 5x Gadget @50, 18% VAT -> subtotal 250, vat 45, total 295.
    const orderE = await submitOrder(alpha.tenantId, alpha.customers[0].id, alphaBuyerUserId, "Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: addressId,
      lines: [{ productUnitId: alphaGadgetUnitId, quantity: 5 }],
    });
    if (!orderE.ok) throw new Error("setup: order E failed");
    await setSubmittedAt(alpha.tenantId, orderE.order.id, new Date("2020-01-25T12:00:00Z"));

    // A same-period Beta order, to prove tenant isolation.
    const betaBuyerUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: beta.customers[0].buyerEmail } })).id;
    const betaAddresses = await listActiveCustomerAddresses(beta.tenantId, beta.customers[0].id);
    const betaWidget = await withTenantContext(beta.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));
    const betaOrder = await submitOrder(beta.tenantId, beta.customers[0].id, betaBuyerUserId, "Buyer", "BUYER_ADMIN", "CUSTOMER", {
      deliveryAddressId: betaAddresses[0].id,
      lines: [{ productUnitId: betaWidget.id, quantity: 100 }],
    });
    if (!betaOrder.ok) throw new Error("setup: beta order failed");
    await setSubmittedAt(beta.tenantId, betaOrder.order.id, new Date("2020-01-12T12:00:00Z"));
  }, 60_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("sums submitted order value from non-cancelled, in-range orders only", async () => {
    const result = await getSalesAnalytics(alpha.tenantId, JANUARY_2020);
    // Order A (354) + Order B (472, as SUBMITTED, ignoring its later
    // confirmedQty) + Order E (295). Order C (cancelled) and D (out of
    // range) are excluded.
    expect(result.submittedOrderValue).toBe(1121);
    expect(result.orderCount).toBe(3);
  });

  it("is unaffected by a later confirmation at a reduced quantity", async () => {
    const beforeConfirmValue = 1121; // established above, already includes order B confirmed at qty 2
    const order = await withTenantContext(alpha.tenantId, (tx) => tx.order.findUniqueOrThrow({ where: { id: orderBId }, include: { lines: true } }));
    expect(order.status).toBe("CONFIRMED");
    expect(Number(order.lines[0].confirmedQty)).toBe(2);
    expect(Number(order.lines[0].requestedQty)).toBe(4);

    const result = await getSalesAnalytics(alpha.tenantId, JANUARY_2020);
    expect(result.submittedOrderValue).toBe(beforeConfirmValue);
  });

  it("is unaffected by a price-list change made after submission", async () => {
    await withTenantContext(alpha.tenantId, (tx) =>
      tx.priceListItem.updateMany({ where: { productUnitId: alphaGadgetUnitId }, data: { price: 999 } })
    );

    const result = await getSalesAnalytics(alpha.tenantId, JANUARY_2020);
    expect(result.submittedOrderValue).toBe(1121); // Order E still contributes 295, priced at its 50 snapshot, not 999.

    // restore for any later test in this file
    await withTenantContext(alpha.tenantId, (tx) =>
      tx.priceListItem.updateMany({ where: { productUnitId: alphaGadgetUnitId }, data: { price: 50 } })
    );
  });

  it("ranks top products by requested quantity, excluding cancelled/out-of-range orders", async () => {
    const result = await getSalesAnalytics(alpha.tenantId, JANUARY_2020);
    expect(result.topProducts).toHaveLength(2);
    // Widget: order A (3) + order B (4, requested - not the confirmed 2) = 7.
    expect(result.topProducts[0]).toMatchObject({ requestedQty: 7 });
    expect(result.topProducts[0].sku).toContain("WIDGET");
    // Gadget: order E (5) only.
    expect(result.topProducts[1]).toMatchObject({ requestedQty: 5 });
    expect(result.topProducts[1].sku).toContain("GADGET");
  });

  it("never includes another tenant's orders or products", async () => {
    const result = await getSalesAnalytics(alpha.tenantId, JANUARY_2020);
    expect(result.submittedOrderValue).toBe(1121); // not inflated by Beta's 100-unit order
    for (const product of result.topProducts) {
      expect(product.sku.startsWith("PHI-ANALYTICS")).toBe(true);
    }

    const betaResult = await getSalesAnalytics(beta.tenantId, JANUARY_2020);
    expect(betaResult.orderCount).toBe(1);
    for (const product of betaResult.topProducts) {
      expect(product.sku.startsWith("CHI-ANALYTICS")).toBe(true);
    }
  });

  it("RLS alone (bypassing Layer 2) scopes the OrderLine aggregate to one tenant", async () => {
    // OrderLine has no tenantId column and isn't in TENANT_SCOPED_MODELS, so
    // Layer 2 never adds a scope filter to it - this proves RLS is the real
    // backstop for the groupBy query getSalesAnalytics relies on.
    const rows = await prismaBase.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${alpha.tenantId}, true)`;
      return tx.orderLine.groupBy({
        by: ["productSkuSnapshot"],
        where: { order: { submittedAt: { gte: JANUARY_2020.from, lt: JANUARY_2020.to }, status: { not: "CANCELLED" } } },
        _sum: { requestedQty: true },
      });
    });
    for (const row of rows) {
      expect(row.productSkuSnapshot.startsWith("PHI-ANALYTICS")).toBe(true);
    }
  });

  it("an order outside the range never contributes, and an in-range one always does (inclusive-start/exclusive-end)", async () => {
    const exactlyAtStart: DashboardDateRange = { option: "custom", from: new Date("2020-01-10T12:00:00Z"), to: JANUARY_2020.to };
    const startInclusive = await getSalesAnalytics(alpha.tenantId, exactlyAtStart);
    expect(startInclusive.orderCount).toBe(3); // order A (at exactly `from`) is included

    const exclusiveEnd: DashboardDateRange = { option: "custom", from: JANUARY_2020.from, to: new Date("2020-01-10T12:00:00Z") };
    const endExclusive = await getSalesAnalytics(alpha.tenantId, exclusiveEnd);
    expect(endExclusive.orderCount).toBe(0); // order A (at exactly `to`) is excluded
  });
});
