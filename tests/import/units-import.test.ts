import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { confirmImport, previewImport } from "@/lib/domain/import/import-service";
import { csv } from "./helpers";

describe("UnitOfMeasure import", () => {
  let tenant: SeededTenant;
  let actorUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Unit", "unit-import", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("creates a new unit of measure", async () => {
    const file = csv(["code", "labelMk", "labelEn", "isActive"], [["box", "кутија", "Box", "true"]]);
    const result = await confirmImport("units", tenant.tenantId, actorUserId, file, "units.csv");
    expect(result.summary).toMatchObject({ created: 1, updated: 0, unchanged: 0, rejected: 0 });
  });

  it("updates an existing unit matched by code", async () => {
    const file = csv(["code", "labelMk", "labelEn", "isActive"], [["box", "кутија", "Carton", "true"]]);
    const result = await confirmImport("units", tenant.tenantId, actorUserId, file, "units2.csv");
    expect(result.summary).toMatchObject({ created: 0, updated: 1, unchanged: 0, rejected: 0 });
    const row = await withTenantContext(tenant.tenantId, (tx) => tx.unitOfMeasure.findFirst({ where: { code: "box" } }));
    expect(row?.labelEn).toBe("Carton");
  });

  it("rejects an invalid code (disallowed characters)", async () => {
    const file = csv(["code", "labelMk", "labelEn", "isActive"], [["bad code!", "х", "y", "true"]]);
    const result = await previewImport("units", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(1);
  });

  it("rejects an unrecognized boolean token", async () => {
    const file = csv(["code", "labelMk", "labelEn", "isActive"], [["kg", "кг", "Kg", "maybe"]]);
    const result = await previewImport("units", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(1);
    expect(result.rows[0].errors[0].code).toBe("INVALID_BOOLEAN");
  });
});
