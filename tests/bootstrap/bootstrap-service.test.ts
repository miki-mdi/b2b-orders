import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { bootstrapPilotTenant, type BootstrapInput } from "@/lib/bootstrap/bootstrap-service";
import { BootstrapPreconditionError } from "@/lib/bootstrap/preconditions";
import { resetDatabase, seedTenant } from "../../prisma/seed";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

const baseInput: BootstrapInput = {
  tenantName: "Pilot Co",
  tenantSlug: "pilot-co",
  defaultVatRate: "18",
  adminEmail: "pilot-admin@pilot-co.test",
  adminName: "Pilot Seller Admin",
  passwordHash: "placeholder-set-in-beforeEach",
};

describe("bootstrapPilotTenant (atomic transaction)", () => {
  let input: BootstrapInput;

  beforeEach(async () => {
    await resetDatabase();
    input = { ...baseInput, passwordHash: await hashPassword("a-real-bootstrap-password-123") };
  });

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("creates exactly one Tenant, one User, and one SELLER_ADMIN TenantMembership", async () => {
    const result = await bootstrapPilotTenant(prismaBase, MIGRATIONS_DIR, input);

    expect(await prismaBase.tenant.count()).toBe(1);
    expect(await prismaBase.user.count()).toBe(1);

    const tenant = await prismaBase.tenant.findUniqueOrThrow({ where: { id: result.tenantId } });
    expect(tenant.name).toBe(input.tenantName);
    expect(tenant.slug).toBe(input.tenantSlug);

    const user = await prismaBase.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user.email).toBe(input.adminEmail);
    expect(user.passwordHash).toBe(input.passwordHash);

    const membership = await prismaBase.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${result.tenantId}, true)`;
      return tx.tenantMembership.findMany({ where: { tenantId: result.tenantId } });
    });
    expect(membership).toHaveLength(1);
    expect(membership[0].userId).toBe(result.userId);
    expect(membership[0].role).toBe("SELLER_ADMIN");
    expect(membership[0].id).toBe(result.tenantMembershipId);
  });

  it("refuses to run against an already-initialized database, leaving the existing data untouched", async () => {
    const seededPasswordHash = await hashPassword("existing-seed-password-123");
    const existing = await seedTenant("Existing", "already-here", seededPasswordHash);

    await expect(bootstrapPilotTenant(prismaBase, MIGRATIONS_DIR, input)).rejects.toThrow(BootstrapPreconditionError);

    // Still exactly the pre-existing tenant - no second tenant was created.
    expect(await prismaBase.tenant.count()).toBe(1);
    const onlyTenant = await prismaBase.tenant.findFirstOrThrow();
    expect(onlyTenant.id).toBe(existing.tenantId);
  });

  it("rolls back the entire transaction if the membership insert fails - zero rows left behind", async () => {
    await expect(
      bootstrapPilotTenant(prismaBase, MIGRATIONS_DIR, input, "NOT_A_REAL_ROLE")
    ).rejects.toThrow();

    expect(await prismaBase.tenant.count()).toBe(0);
    expect(await prismaBase.user.count()).toBe(0);
  });
});
