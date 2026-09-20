import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { exportCustomersCsv } from "@/lib/domain/export/export-service";

/**
 * Phase 1F-A, §14: the Phase 1E export review found ONE real gap - toCsv's
 * escapeCell had no spreadsheet-formula-injection protection. This proves
 * the fix (export/csv.ts's sanitizeForSpreadsheet) actually neutralizes a
 * dangerous customer name end-to-end through the real exportCustomersCsv
 * path, not just the unit-level sanitizeForSpreadsheet test.
 */
describe("CSV export: spreadsheet formula injection is neutralized", () => {
  let tenant: SeededTenant;
  let actorUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Formula", "formula-export", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;

    await withTenantContext(tenant.tenantId, (tx) =>
      tx.customer.create({
        data: { tenantId: tenant.tenantId, name: "=SUM(A1:A10)" },
      })
    );
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("prefixes a customer name starting with a dangerous character so a spreadsheet treats it as text, not a formula", async () => {
    const { csv } = await exportCustomersCsv(tenant.tenantId, actorUserId);
    expect(csv).toContain("'=SUM(A1:A10)");
    expect(csv).not.toMatch(/(?<!')=SUM/);
  });
});
