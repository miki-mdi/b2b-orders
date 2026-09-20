import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { getCustomer, updateCustomerContactInfo } from "@/lib/domain/customers/customer-service";

/**
 * Phase 1F-B1: Sales Rep's "limited edit" of a customer only ever writes
 * contactEmail/contactPhone/notes - see updateCustomerContactInfo's own
 * comment in customer-service.ts for why this is enforced at the domain
 * layer itself, not only by the narrower Server Action schema. These tests
 * prove the actual database write, not just that the function compiles
 * against a narrow input type.
 */
describe("updateCustomerContactInfo", () => {
  let tenant: SeededTenant;
  let actorUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Omega", "omega-contact", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("writes contactEmail/contactPhone/notes and leaves every other field untouched", async () => {
    const customerId = tenant.customers[0].id;
    const before = await getCustomer(tenant.tenantId, customerId);
    if (!before) throw new Error("setup failed");

    const after = await updateCustomerContactInfo(tenant.tenantId, actorUserId, customerId, {
      contactEmail: "buyer@example.test",
      contactPhone: "+389 70 000 000",
      notes: "Prefers morning deliveries.",
    });

    expect(after.contactEmail).toBe("buyer@example.test");
    expect(after.contactPhone).toBe("+389 70 000 000");
    expect(after.notes).toBe("Prefers morning deliveries.");
    // Nothing a Sales Rep isn't allowed to touch actually changed.
    expect(after.name).toBe(before.name);
    expect(after.code).toBe(before.code);
    expect(after.isActive).toBe(before.isActive);
    expect(after.creditLimit).toEqual(before.creditLimit);
  });

  it("clears contactEmail/contactPhone/notes when given null, same absent-vs-blank semantics as other optional fields", async () => {
    const customerId = tenant.customers[0].id;
    const cleared = await updateCustomerContactInfo(tenant.tenantId, actorUserId, customerId, {
      contactEmail: undefined,
      contactPhone: undefined,
      notes: undefined,
    });

    expect(cleared.contactEmail).toBeNull();
    expect(cleared.contactPhone).toBeNull();
    expect(cleared.notes).toBeNull();
  });

  it("writes an audited UPDATE entry", async () => {
    const customerId = tenant.customers[1].id;
    await updateCustomerContactInfo(tenant.tenantId, actorUserId, customerId, {
      contactEmail: "second@example.test",
      contactPhone: undefined,
      notes: undefined,
    });

    const entry = await withTenantContext(tenant.tenantId, (tx) =>
      tx.auditLogEntry.findFirstOrThrow({
        where: { entityType: "Customer", entityId: customerId, action: "UPDATE" },
        orderBy: { createdAt: "desc" },
      })
    );
    expect(entry.actorUserId).toBe(actorUserId);
  });
});
