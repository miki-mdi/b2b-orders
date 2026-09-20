import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { confirmImport, previewImport } from "@/lib/domain/import/import-service";
import { csv } from "./helpers";

describe("Product import", () => {
  let tenant: SeededTenant;
  let other: SeededTenant;
  let actorUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Prod", "prod-import", passwordHash);
    other = await seedTenant("Other", "other-import", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;

    await withTenantContext(tenant.tenantId, (tx) => tx.category.updateMany({ data: { code: "GENERAL" } }));
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("creates a new product resolving categoryCode within the tenant", async () => {
    const file = csv(
      ["sku", "nameMk", "nameEn", "categoryCode", "description", "barcode", "defaultVatRate", "isActive"],
      [["NEW-SKU-1", "Нов производ", "New Product", "GENERAL", "", "", 18, "true"]]
    );
    const result = await confirmImport("products", tenant.tenantId, actorUserId, file, "products.csv");
    expect(result.summary).toMatchObject({ created: 1, updated: 0, unchanged: 0, rejected: 0 });

    const created = await withTenantContext(tenant.tenantId, (tx) => tx.product.findFirst({ where: { sku: "NEW-SKU-1" } }));
    expect(created?.nameEn).toBe("New Product");
  });

  it("updates an existing product matched by sku", async () => {
    const file = csv(
      ["sku", "nameMk", "nameEn", "categoryCode", "isActive"],
      [["NEW-SKU-1", "Нов производ", "Renamed Product", "GENERAL", "true"]]
    );
    const result = await confirmImport("products", tenant.tenantId, actorUserId, file, "products2.csv");
    expect(result.summary).toMatchObject({ created: 0, updated: 1, unchanged: 0, rejected: 0 });
  });

  it("rejects a row referencing a category code that doesn't exist for this tenant", async () => {
    const file = csv(
      ["sku", "nameMk", "nameEn", "categoryCode", "isActive"],
      [["MISSING-CAT", "х", "y", "NO-SUCH-CATEGORY", "true"]]
    );
    const result = await previewImport("products", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(1);
    expect(result.rows[0].errors[0].code).toBe("REFERENCE_NOT_FOUND");
  });

  it("rejects a row referencing another tenant's category code - never resolves cross-tenant", async () => {
    await withTenantContext(other.tenantId, (tx) => tx.category.updateMany({ data: { code: "OTHER-CAT" } }));
    const file = csv(
      ["sku", "nameMk", "nameEn", "categoryCode", "isActive"],
      [["CROSS-TENANT", "х", "y", "OTHER-CAT", "true"]]
    );
    const result = await previewImport("products", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(1);
    expect(result.rows[0].errors[0].code).toBe("REFERENCE_NOT_FOUND");
  });

  it("rejects a duplicate sku within the same file", async () => {
    const file = csv(
      ["sku", "nameMk", "nameEn", "categoryCode", "isActive"],
      [
        ["DUP-SKU", "х", "y", "GENERAL", "true"],
        ["DUP-SKU", "х2", "y2", "GENERAL", "true"],
      ]
    );
    const result = await previewImport("products", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(2);
  });

  it("rejects an invalid VAT rate", async () => {
    const file = csv(
      ["sku", "nameMk", "nameEn", "categoryCode", "defaultVatRate", "isActive"],
      [["BAD-VAT", "х", "y", "GENERAL", 150, "true"]]
    );
    const result = await previewImport("products", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(1);
  });
});
