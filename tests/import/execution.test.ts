import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { confirmImport, previewImport } from "@/lib/domain/import/import-service";
import { planAndExecuteRows } from "@/lib/domain/import/driver";
import { parseCsv } from "@/lib/domain/import/csv-parser";
import { createCategoryImportOps } from "@/lib/domain/import/categories-import";
import { csv } from "./helpers";

describe("CSV import: execution guarantees", () => {
  let tenant: SeededTenant;
  let actorUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Exec", "exec-import", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("preview performs zero writes even when every row is a valid CREATE", async () => {
    const before = await withTenantContext(tenant.tenantId, (tx) => tx.category.count());
    const file = csv(["code", "nameMk", "nameEn"], [
      ["PV-1", "А", "A"],
      ["PV-2", "Б", "B"],
    ]);
    const preview = await previewImport("categories", tenant.tenantId, actorUserId, file);
    expect(preview.summary.created).toBe(2);
    const after = await withTenantContext(tenant.tenantId, (tx) => tx.category.count());
    expect(after).toBe(before);
  });

  it("confirm writes exactly the planned CREATE/UPDATE rows and leaves NO_CHANGE/ERROR rows alone, with a matching audit summary", async () => {
    // Baseline: one category that will end up UPDATE, one that will end up NO_CHANGE.
    await confirmImport(
      "categories",
      tenant.tenantId,
      actorUserId,
      csv(["code", "nameMk", "nameEn"], [
        ["MIX-UPDATE", "Старо", "Old Name"],
        ["MIX-NOCHANGE", "Исто", "Same Name"],
      ]),
      "baseline.csv"
    );

    const mixedFile = csv(["code", "nameMk", "nameEn"], [
      ["MIX-CREATE", "Ново", "New"], // CREATE
      ["MIX-UPDATE", "Старо", "Updated Name"], // UPDATE
      ["MIX-NOCHANGE", "Исто", "Same Name"], // NO_CHANGE
      ["", "Б", "Missing code"], // ERROR
    ]);

    const result = await confirmImport("categories", tenant.tenantId, actorUserId, mixedFile, "mixed.csv");
    expect(result.summary).toMatchObject({ totalRows: 4, created: 1, updated: 1, unchanged: 1, rejected: 1 });

    const created = await withTenantContext(tenant.tenantId, (tx) => tx.category.findFirst({ where: { code: "MIX-CREATE" } }));
    expect(created).not.toBeNull();
    const updated = await withTenantContext(tenant.tenantId, (tx) => tx.category.findFirst({ where: { code: "MIX-UPDATE" } }));
    expect(updated?.nameEn).toBe("Updated Name");
    const unchanged = await withTenantContext(tenant.tenantId, (tx) => tx.category.findFirst({ where: { code: "MIX-NOCHANGE" } }));
    expect(unchanged?.nameEn).toBe("Same Name");

    // One summary audit entry recording exactly these counts.
    const auditEntry = await withTenantContext(tenant.tenantId, (tx) =>
      tx.auditLogEntry.findFirst({ where: { entityType: "Import", entityId: `categories:${result.summary.batchId}` } })
    );
    expect(auditEntry).not.toBeNull();
    const newValue = JSON.parse(auditEntry!.newValue!);
    expect(newValue).toMatchObject({ created: 1, updated: 1, unchanged: 1, rejected: 1, fileName: "mixed.csv" });

    // Plus a per-row audit entry for the actual writes (reused from the manual create/update path).
    const rowAuditEntries = await withTenantContext(tenant.tenantId, (tx) =>
      tx.auditLogEntry.findMany({ where: { entityType: "Category", reason: { contains: result.summary.batchId } } })
    );
    expect(rowAuditEntries.length).toBe(2); // one CREATE + one UPDATE
  });

  it("an unexpected failure while writing one row rolls back the entire import - no partial state", async () => {
    const parsed = parseCsv(
      csv(["code", "nameMk", "nameEn"], [
        ["ROLLBACK-1", "А", "A"],
        ["ROLLBACK-2", "Б", "B"],
      ])
    );
    const realOps = createCategoryImportOps(parsed.headers);
    let callCount = 0;
    const failingOps: typeof realOps = {
      ...realOps,
      executeCreate: async (tx, tenantId, actor, data, refs, reason) => {
        callCount += 1;
        if (callCount === 2) throw new Error("simulated unexpected failure");
        return realOps.executeCreate(tx, tenantId, actor, data, refs, reason);
      },
    };

    await expect(
      withTenantContext(tenant.tenantId, (tx) =>
        planAndExecuteRows(tx, tenant.tenantId, actorUserId, parsed, failingOps, "confirm", "test-rollback")
      )
    ).rejects.toThrow("simulated unexpected failure");

    const rows = await withTenantContext(tenant.tenantId, (tx) =>
      tx.category.findMany({ where: { code: { in: ["ROLLBACK-1", "ROLLBACK-2"] } } })
    );
    // The first row's create is rolled back along with the second row's
    // failure - proving the whole confirmed import is one atomic
    // transaction, not per-row commits (requirement #8).
    expect(rows).toHaveLength(0);
  });

  it("a row planned as ERROR does not abort the batch - it is simply skipped", async () => {
    const file = csv(["code", "nameMk", "nameEn"], [
      ["SKIP-OK", "А", "A"],
      ["", "Б", "Missing code"],
    ]);
    const result = await confirmImport("categories", tenant.tenantId, actorUserId, file, "skip.csv");
    expect(result.summary).toMatchObject({ created: 1, rejected: 1 });
    const ok = await withTenantContext(tenant.tenantId, (tx) => tx.category.findFirst({ where: { code: "SKIP-OK" } }));
    expect(ok).not.toBeNull();
  });
});
