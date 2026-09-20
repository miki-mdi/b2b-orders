import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { confirmImport, previewImport } from "@/lib/domain/import/import-service";
import { csv } from "./helpers";

/**
 * Phase 1F-A, §6/§16: every import reference is resolved through the
 * tenant-scoped tx (Layer 2 + RLS), so a code/sku that only exists in
 * another tenant must never resolve, and any tenantId-shaped column in the
 * uploaded file must be silently ignored rather than trusted. The
 * per-entity test files already cover one instance of this each in
 * context (e.g. products-import.test.ts); this file is the dedicated,
 * broader check across entity types, per requirement #16's explicit ask.
 *
 * Note: "a buyer session cannot reach the import Server Actions/routes" is
 * verified live in the browser (step 17), not here - matching this
 * codebase's existing convention for page-level auth guards (see
 * docs/SESSION_HANDOFF.md §7's "Diagnostics authorization" bullet, verified
 * the same way in Phase 1E rather than by mocking next-auth's session).
 */
describe("CSV import: tenant isolation", () => {
  let alpha: SeededTenant;
  let beta: SeededTenant;
  let alphaActorUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    alpha = await seedTenant("Alpha", "alpha-tenant-import", passwordHash);
    beta = await seedTenant("Beta", "beta-tenant-import", passwordHash);
    alphaActorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: alpha.sellerAdminEmail } })).id;

    await withTenantContext(beta.tenantId, (tx) => tx.unitOfMeasure.updateMany({ where: { code: "pc" }, data: { code: "betaunit" } }));
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("a product-unit's unitOfMeasureCode belonging to a different tenant never resolves", async () => {
    const file = csv(
      ["sku", "productSku", "unitOfMeasureCode", "label", "minOrderQty", "orderIncrement", "isDefault", "isActive"],
      [["CROSS-1", "ALPHA-TENANT-IMPORT-WIDGET", "betaunit", "Box", 1, 1, "false", "true"]]
    );
    const result = await previewImport("product-units", alpha.tenantId, alphaActorUserId, file);
    expect(result.summary.rejected).toBe(1);
    expect(result.rows[0].errors[0].code).toBe("REFERENCE_NOT_FOUND");
  });

  it("a productSku belonging to a different tenant never resolves", async () => {
    const file = csv(
      ["sku", "productSku", "unitOfMeasureCode", "label", "minOrderQty", "orderIncrement", "isDefault", "isActive"],
      [["CROSS-2", "BETA-TENANT-IMPORT-WIDGET", "pc", "Box", 1, 1, "false", "true"]]
    );
    const result = await previewImport("product-units", alpha.tenantId, alphaActorUserId, file);
    expect(result.summary.rejected).toBe(1);
    expect(result.rows[0].errors[0].code).toBe("REFERENCE_NOT_FOUND");
  });

  it("importing a customer that reuses another tenant's code creates a separate, correctly tenant-scoped row (never collides across tenants)", async () => {
    await withTenantContext(beta.tenantId, (tx) => tx.customer.update({ where: { id: beta.customers[0].id }, data: { code: "SHARED-CODE" } }));

    const file = csv(["code", "name", "isActive"], [["SHARED-CODE", "Alpha's own customer", "true"]]);
    const result = await confirmImport("customers", alpha.tenantId, alphaActorUserId, file, "shared-code.csv");
    expect(result.summary).toMatchObject({ created: 1, updated: 0 });

    const alphaRow = await withTenantContext(alpha.tenantId, (tx) => tx.customer.findFirst({ where: { code: "SHARED-CODE" } }));
    const betaRow = await withTenantContext(beta.tenantId, (tx) => tx.customer.findFirst({ where: { code: "SHARED-CODE" } }));
    expect(alphaRow?.name).toBe("Alpha's own customer");
    expect(betaRow?.id).toBe(beta.customers[0].id);
    expect(alphaRow?.id).not.toBe(betaRow?.id);
  });

  it("ignores an id column in the file rather than trusting it to target an existing row", async () => {
    const someBetaCustomerId = beta.customers[1].id;
    const file = csv(["id", "code", "name", "isActive"], [[someBetaCustomerId, "NOT-A-REAL-TARGET", "Should not touch beta", "true"]]);
    const result = await confirmImport("customers", alpha.tenantId, alphaActorUserId, file, "ignore-id.csv");
    expect(result.summary.created).toBe(1);

    const betaCustomerUnchanged = await withTenantContext(beta.tenantId, (tx) => tx.customer.findUniqueOrThrow({ where: { id: someBetaCustomerId } }));
    expect(betaCustomerUnchanged.name).toBe(beta.customers[1].name); // untouched
  });
});
