import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { confirmImport, previewImport } from "@/lib/domain/import/import-service";
import { csv } from "./helpers";

describe("CustomerAddress import", () => {
  let tenant: SeededTenant;
  let actorUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Addr", "addr-import", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
    await withTenantContext(tenant.tenantId, (tx) => tx.customer.update({ where: { id: tenant.customers[0].id }, data: { code: "CUST-A" } }));
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("creates a new address for an existing customer resolved by code", async () => {
    const file = csv(
      ["customerCode", "label", "recipientName", "phone", "addressLine1", "addressLine2", "city", "postalCode", "country", "isDefaultDelivery", "isDefaultBilling", "isActive"],
      [["CUST-A", "Second warehouse", "Contact", "", "Street 2", "", "Skopje", "1000", "MK", "false", "false", "true"]]
    );
    const result = await confirmImport("customer-addresses", tenant.tenantId, actorUserId, file, "addresses.csv");
    expect(result.summary).toMatchObject({ created: 1, updated: 0, unchanged: 0, rejected: 0 });
  });

  it("updates an existing address matched by (customerCode, label)", async () => {
    const file = csv(
      ["customerCode", "label", "recipientName", "addressLine1", "city", "isDefaultDelivery", "isDefaultBilling", "isActive"],
      [["CUST-A", "Second warehouse", "New Contact", "Street 2", "Skopje", "false", "false", "true"]]
    );
    const result = await confirmImport("customer-addresses", tenant.tenantId, actorUserId, file, "addresses2.csv");
    expect(result.summary).toMatchObject({ created: 0, updated: 1, unchanged: 0, rejected: 0 });
  });

  it("rejects a row referencing a customer code that doesn't exist for this tenant", async () => {
    const file = csv(
      ["customerCode", "label", "recipientName", "addressLine1", "city", "isActive"],
      [["NO-SUCH-CUSTOMER", "Label", "C", "Street", "Skopje", "true"]]
    );
    const result = await previewImport("customer-addresses", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(1);
    expect(result.rows[0].errors[0].code).toBe("REFERENCE_NOT_FOUND");
  });

  it("rejects a duplicate (customerCode, label) pair within the same file", async () => {
    const file = csv(
      ["customerCode", "label", "recipientName", "addressLine1", "city", "isActive"],
      [
        ["CUST-A", "Dup Label", "A", "Street", "Skopje", "true"],
        ["CUST-A", "Dup Label", "B", "Street 2", "Skopje", "true"],
      ]
    );
    const result = await previewImport("customer-addresses", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(2);
  });
});
