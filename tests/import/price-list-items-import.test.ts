import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { confirmImport, previewImport } from "@/lib/domain/import/import-service";
import { csv } from "./helpers";

describe("PriceListItem import", () => {
  let tenant: SeededTenant;
  let actorUserId: string;
  const priceListCode = "STD";
  const productUnitSku = "PLI-IMPORT-WIDGET-PC";

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("PLI", "pli-import", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
    await withTenantContext(tenant.tenantId, (tx) => tx.priceList.updateMany({ data: { code: priceListCode } }));
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("updates the existing seeded price list item (created by seedTenant) matched by (priceListCode, productUnitSku)", async () => {
    const file = csv(["priceListCode", "productUnitSku", "price"], [[priceListCode, productUnitSku, 150]]);
    const result = await confirmImport("price-list-items", tenant.tenantId, actorUserId, file, "pli.csv");
    expect(result.summary).toMatchObject({ created: 0, updated: 1, unchanged: 0, rejected: 0 });
    const row = await withTenantContext(tenant.tenantId, (tx) => tx.priceListItem.findFirst({ where: { productUnit: { sku: productUnitSku } } }));
    expect(Number(row?.price)).toBe(150);
  });

  it("reports NO_CHANGE for an unchanged price", async () => {
    const file = csv(["priceListCode", "productUnitSku", "price"], [[priceListCode, productUnitSku, 150]]);
    const result = await confirmImport("price-list-items", tenant.tenantId, actorUserId, file, "pli2.csv");
    expect(result.summary).toMatchObject({ created: 0, updated: 0, unchanged: 1, rejected: 0 });
  });

  it("rejects a row referencing a price list code that doesn't exist", async () => {
    const file = csv(["priceListCode", "productUnitSku", "price"], [["NO-SUCH-LIST", productUnitSku, 10]]);
    const result = await previewImport("price-list-items", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(1);
    expect(result.rows[0].errors.some((e) => e.code === "REFERENCE_NOT_FOUND")).toBe(true);
  });

  it("rejects a row referencing a product unit sku that doesn't exist", async () => {
    const file = csv(["priceListCode", "productUnitSku", "price"], [[priceListCode, "NO-SUCH-SKU", 10]]);
    const result = await previewImport("price-list-items", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(1);
    expect(result.rows[0].errors.some((e) => e.code === "REFERENCE_NOT_FOUND")).toBe(true);
  });

  it("rejects a zero or negative price", async () => {
    const file = csv(["priceListCode", "productUnitSku", "price"], [[priceListCode, productUnitSku, 0]]);
    const result = await previewImport("price-list-items", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(1);
  });

  it("rejects a non-numeric price", async () => {
    const file = csv(["priceListCode", "productUnitSku", "price"], [[priceListCode, productUnitSku, "not-a-number"]]);
    const result = await previewImport("price-list-items", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(1);
  });

  it("rejects a duplicate (priceListCode, productUnitSku) pair within the same file", async () => {
    const file = csv(
      ["priceListCode", "productUnitSku", "price"],
      [
        [priceListCode, productUnitSku, 10],
        [priceListCode, productUnitSku, 20],
      ]
    );
    const result = await previewImport("price-list-items", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(2);
  });
});
