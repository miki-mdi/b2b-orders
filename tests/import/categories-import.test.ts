import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { confirmImport, previewImport } from "@/lib/domain/import/import-service";
import { csv } from "./helpers";

describe("Category import", () => {
  let tenant: SeededTenant;
  let actorUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Cat", "cat-import", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("creates a new category", async () => {
    const file = csv(["code", "nameMk", "nameEn", "description", "sortOrder", "isActive"], [["BEV", "Пијалоци", "Beverages", "", 0, "true"]]);
    const result = await confirmImport("categories", tenant.tenantId, actorUserId, file, "categories.csv");
    expect(result.summary).toMatchObject({ created: 1, updated: 0, unchanged: 0, rejected: 0 });

    const created = await withTenantContext(tenant.tenantId, (tx) => tx.category.findFirst({ where: { code: "BEV" } }));
    expect(created?.nameEn).toBe("Beverages");
    expect(created?.nameMk).toBe("Пијалоци");
  });

  it("updates an existing category matched by code, preserving columns absent from the file", async () => {
    const createFile = csv(["code", "nameMk", "nameEn", "description", "sortOrder", "isActive"], [["UPD", "Име", "Name", "Desc", 5, "true"]]);
    await confirmImport("categories", tenant.tenantId, actorUserId, createFile, "c1.csv");

    const updateFile = csv(["code", "nameMk", "nameEn"], [["UPD", "Име", "New Name"]]);
    const result = await confirmImport("categories", tenant.tenantId, actorUserId, updateFile, "c2.csv");
    expect(result.summary).toMatchObject({ created: 0, updated: 1, unchanged: 0, rejected: 0 });

    const updated = await withTenantContext(tenant.tenantId, (tx) => tx.category.findFirst({ where: { code: "UPD" } }));
    expect(updated?.nameEn).toBe("New Name");
    expect(updated?.description).toBe("Desc"); // preserved - column was absent from updateFile
    expect(updated?.sortOrder).toBe(5); // preserved
  });

  it("clears an optional field when its column is present but blank", async () => {
    const file = csv(["code", "nameMk", "nameEn", "description"], [["UPD", "Име", "New Name", ""]]);
    const result = await confirmImport("categories", tenant.tenantId, actorUserId, file, "c-clear.csv");
    expect(result.summary.updated).toBe(1);
    const row = await withTenantContext(tenant.tenantId, (tx) => tx.category.findFirst({ where: { code: "UPD" } }));
    expect(row?.description).toBeNull();
  });

  it("reports NO_CHANGE when the row already matches the database", async () => {
    const file = csv(["code", "nameMk", "nameEn", "sortOrder", "isActive"], [["UPD", "Име", "New Name", 5, "true"]]);
    const result = await confirmImport("categories", tenant.tenantId, actorUserId, file, "c3.csv");
    expect(result.summary).toMatchObject({ created: 0, updated: 0, unchanged: 1, rejected: 0 });
  });

  it("rejects every row sharing a duplicate code within the same file", async () => {
    const file = csv(["code", "nameMk", "nameEn"], [["DUP", "А", "A"], ["DUP", "Б", "B"]]);
    const result = await previewImport("categories", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(2);
    expect(result.rows.every((r) => r.status === "ERROR")).toBe(true);
    expect(result.rows[0].errors[0].code).toBe("DUPLICATE_KEY_IN_FILE");
  });

  it("rejects a row missing a required field", async () => {
    const file = csv(["code", "nameMk", "nameEn"], [["", "А", "A"]]);
    const result = await previewImport("categories", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(1);
    expect(result.rows[0].status).toBe("ERROR");
  });

  it("preview never writes to the database", async () => {
    const before = await withTenantContext(tenant.tenantId, (tx) => tx.category.count());
    const file = csv(["code", "nameMk", "nameEn"], [["PREVIEWONLY", "А", "A"]]);
    const preview = await previewImport("categories", tenant.tenantId, actorUserId, file);
    expect(preview.summary.created).toBe(1);
    const after = await withTenantContext(tenant.tenantId, (tx) => tx.category.count());
    expect(after).toBe(before);
  });
});
