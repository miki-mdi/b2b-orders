import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { exportCustomersCsv, exportOrdersCsv, exportOrderLinesCsv, exportProductsCsv, exportPriceListsCsv } from "@/lib/domain/export/export-service";
import { listAuditLogEntries } from "@/lib/domain/audit/audit-query-service";

/**
 * Phase 1E, §10: proves a CSV export for one tenant never includes another
 * tenant's rows, for every export type - and that the export action itself
 * is recorded as a tenant-scoped audit entry.
 */
describe("CSV export: tenant isolation and auditing", () => {
  let alpha: SeededTenant;
  let beta: SeededTenant;
  let alphaActorUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    alpha = await seedTenant("Kappa", "kappa-export", passwordHash);
    beta = await seedTenant("Lambda", "lambda-export", passwordHash);
    alphaActorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: alpha.sellerAdminEmail } })).id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("exportCustomersCsv only includes this tenant's customers", async () => {
    const { csv } = await exportCustomersCsv(alpha.tenantId, alphaActorUserId);
    for (const customer of alpha.customers) {
      expect(csv).toContain(customer.name);
    }
    for (const customer of beta.customers) {
      expect(csv).not.toContain(customer.name);
    }
  });

  it("exportProductsCsv only includes this tenant's catalog", async () => {
    const { csv } = await exportProductsCsv(alpha.tenantId, alphaActorUserId);
    expect(csv).toContain("KAPPA-EXPORT-WIDGET");
    expect(csv).not.toContain("LAMBDA-EXPORT-WIDGET");
  });

  it("exportPriceListsCsv only includes this tenant's price list items", async () => {
    const { csv } = await exportPriceListsCsv(alpha.tenantId, alphaActorUserId);
    for (const customer of beta.customers) {
      expect(csv).not.toContain(customer.name);
    }
  });

  it("exportOrdersCsv and exportOrderLinesCsv only include this tenant's orders", async () => {
    const orders = await exportOrdersCsv(alpha.tenantId, alphaActorUserId);
    const lines = await exportOrderLinesCsv(alpha.tenantId, alphaActorUserId);

    const alphaOrderNumber = await withTenantContext(alpha.tenantId, (tx) =>
      tx.order.findUniqueOrThrow({ where: { id: alpha.sampleOrderId } })
    );
    const betaOrderNumber = await withTenantContext(beta.tenantId, (tx) =>
      tx.order.findUniqueOrThrow({ where: { id: beta.sampleOrderId } })
    );

    expect(orders.csv).toContain(String(alphaOrderNumber.orderNumber));
    expect(lines.csv).toContain(alpha.customers[0].name);
    for (const customer of beta.customers) {
      expect(orders.csv).not.toContain(customer.name);
      expect(lines.csv).not.toContain(customer.name);
    }
    // Order numbers are per-tenant sequences (both tenants' first order is
    // #1) so this only checks customer names above, not order numbers,
    // for the cross-tenant negative assertion - the same numeric orderNumber
    // legitimately exists in both tenants and isn't itself a leak signal.
    void betaOrderNumber;
  });

  it("each export writes a tenant-scoped audit entry for the export action", async () => {
    const result = await listAuditLogEntries(alpha.tenantId, { entityType: "Export" }, 1, 50);
    const exportTypes = result.entries.map((e) => e.entityId);
    expect(exportTypes).toEqual(
      expect.arrayContaining(["customers", "products", "price-lists", "orders", "order-lines"])
    );
  });
});
