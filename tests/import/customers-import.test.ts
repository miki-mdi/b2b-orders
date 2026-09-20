import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { confirmImport, previewImport } from "@/lib/domain/import/import-service";
import { csv } from "./helpers";

describe("Customer import", () => {
  let tenant: SeededTenant;
  let actorUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Cust", "cust-import", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("creates a new customer, including its discount", async () => {
    const file = csv(
      ["code", "name", "taxId", "contactEmail", "contactPhone", "notes", "discountPercent", "creditLimit", "paymentTermsDays", "isActive"],
      [["CUST-1", "Нов Клиент ДОО", "MK123", "buyer@example.com", "", "", 5, "", 30, "true"]]
    );
    const result = await confirmImport("customers", tenant.tenantId, actorUserId, file, "customers.csv");
    expect(result.summary).toMatchObject({ created: 1, updated: 0, unchanged: 0, rejected: 0 });

    const created = await withTenantContext(tenant.tenantId, (tx) => tx.customer.findFirst({ where: { code: "CUST-1" } }));
    expect(created?.name).toBe("Нов Клиент ДОО");
    expect(Number(created?.discountPercent)).toBe(5);
  });

  it("updates an existing customer's discount independently via the same import row", async () => {
    const file = csv(["code", "name", "discountPercent", "isActive"], [["CUST-1", "Нов Клиент ДОО", 10, "true"]]);
    const result = await confirmImport("customers", tenant.tenantId, actorUserId, file, "customers2.csv");
    expect(result.summary).toMatchObject({ created: 0, updated: 1, unchanged: 0, rejected: 0 });
    const row = await withTenantContext(tenant.tenantId, (tx) => tx.customer.findFirst({ where: { code: "CUST-1" } }));
    expect(Number(row?.discountPercent)).toBe(10);
  });

  it("leaves the discount untouched when the discountPercent column is absent", async () => {
    const file = csv(["code", "name", "notes", "isActive"], [["CUST-1", "Нов Клиент ДОО", "updated notes", "true"]]);
    const result = await confirmImport("customers", tenant.tenantId, actorUserId, file, "customers3.csv");
    expect(result.summary.updated).toBe(1);
    const row = await withTenantContext(tenant.tenantId, (tx) => tx.customer.findFirst({ where: { code: "CUST-1" } }));
    expect(Number(row?.discountPercent)).toBe(10); // still 10, untouched
    expect(row?.notes).toBe("updated notes");
  });

  it("clears the discount when discountPercent is present but blank", async () => {
    const file = csv(["code", "name", "discountPercent", "isActive"], [["CUST-1", "Нов Клиент ДОО", "", "true"]]);
    const result = await confirmImport("customers", tenant.tenantId, actorUserId, file, "customers4.csv");
    expect(result.summary.updated).toBe(1);
    const row = await withTenantContext(tenant.tenantId, (tx) => tx.customer.findFirst({ where: { code: "CUST-1" } }));
    expect(row?.discountPercent).toBeNull();
  });

  it("rejects a duplicate code within the same file", async () => {
    const file = csv(["code", "name", "isActive"], [["DUP", "A", "true"], ["DUP", "B", "true"]]);
    const result = await previewImport("customers", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(2);
  });

  it("rejects an invalid email", async () => {
    const file = csv(["code", "name", "contactEmail", "isActive"], [["BADMAIL", "A", "not-an-email", "true"]]);
    const result = await previewImport("customers", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(1);
  });

  it("rejects a discount out of the 0-100 range", async () => {
    const file = csv(["code", "name", "discountPercent", "isActive"], [["BADDISC", "A", 150, "true"]]);
    const result = await previewImport("customers", tenant.tenantId, actorUserId, file);
    expect(result.summary.rejected).toBe(1);
  });

  it("ignores a tenantId-shaped column in the file rather than trusting it", async () => {
    const file = csv(["code", "name", "tenantId", "isActive"], [["IGNORE-TENANT", "A", "some-other-tenant-id", "true"]]);
    const result = await confirmImport("customers", tenant.tenantId, actorUserId, file, "ignore-tenant.csv");
    expect(result.summary.created).toBe(1);
    const row = await withTenantContext(tenant.tenantId, (tx) => tx.customer.findFirst({ where: { code: "IGNORE-TENANT" } }));
    expect(row?.tenantId).toBe(tenant.tenantId);
  });
});
