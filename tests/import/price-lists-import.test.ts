import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { confirmImport, previewImport } from "@/lib/domain/import/import-service";
import { csv } from "./helpers";

describe("PriceList import", () => {
  let tenant: SeededTenant;
  let actorUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("PL", "pl-import", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("creates a new price list", async () => {
    const file = csv(["code", "name", "description", "currency", "isDefault", "isActive"], [["VIP", "VIP list", "", "MKD", "false", "true"]]);
    const result = await confirmImport("price-lists", tenant.tenantId, actorUserId, file, "pl.csv");
    expect(result.summary).toMatchObject({ created: 1, updated: 0, unchanged: 0, rejected: 0 });
  });

  it("updates an existing price list matched by code", async () => {
    const file = csv(["code", "name", "currency", "isDefault", "isActive"], [["VIP", "VIP list renamed", "MKD", "false", "true"]]);
    const result = await confirmImport("price-lists", tenant.tenantId, actorUserId, file, "pl2.csv");
    expect(result.summary).toMatchObject({ created: 0, updated: 1, unchanged: 0, rejected: 0 });
    const row = await withTenantContext(tenant.tenantId, (tx) => tx.priceList.findFirst({ where: { code: "VIP" } }));
    expect(row?.name).toBe("VIP list renamed");
  });

  it("rejects an invalid currency code", async () => {
    const file = csv(["code", "name", "currency", "isDefault", "isActive"], [["BADCUR", "A", "US", "false", "true"]]);
    const result = await previewImport("price-lists", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(1);
  });

  it("rejects a duplicate code within the same file", async () => {
    const file = csv(["code", "name", "isActive"], [["DUP", "A", "true"], ["DUP", "B", "true"]]);
    const result = await previewImport("price-lists", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(2);
  });
});
