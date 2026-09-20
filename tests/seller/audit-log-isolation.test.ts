import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { createCustomer } from "@/lib/domain/customers/customer-service";
import { listAuditLogActors, listAuditLogEntries } from "@/lib/domain/audit/audit-query-service";

/**
 * Phase 1E, §10: re-verifies that the new audit-log READ path (audit-query-service.ts)
 * carries the same tenant isolation as every other domain read in this
 * codebase - both through the normal application path (withTenantContext,
 * Layer 2 + Layer 3 together) and via RLS alone, bypassing Layer 2 entirely.
 */
describe("audit log: tenant isolation", () => {
  let alpha: SeededTenant;
  let beta: SeededTenant;
  let alphaActorUserId: string;
  let betaActorUserId: string;
  let alphaCustomerId: string;
  let betaCustomerId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    alpha = await seedTenant("Omega", "omega-audit", passwordHash);
    beta = await seedTenant("Sigma", "sigma-audit", passwordHash);

    alphaActorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: alpha.sellerAdminEmail } })).id;
    betaActorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: beta.sellerAdminEmail } })).id;

    const alphaCustomer = await createCustomer(alpha.tenantId, alphaActorUserId, { name: "Alpha Audit Co", isActive: true });
    const betaCustomer = await createCustomer(beta.tenantId, betaActorUserId, { name: "Beta Audit Co", isActive: true });
    alphaCustomerId = alphaCustomer.id;
    betaCustomerId = betaCustomer.id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("listAuditLogEntries never returns another tenant's entries (application path)", async () => {
    const result = await listAuditLogEntries(alpha.tenantId, {}, 1, 50);
    const entityIds = result.entries.map((e) => e.entityId);
    expect(entityIds).toContain(alphaCustomerId);
    expect(entityIds).not.toContain(betaCustomerId);
  });

  it("listAuditLogActors never surfaces another tenant's actor", async () => {
    const actors = await listAuditLogActors(alpha.tenantId);
    const actorIds = actors.map((a) => a.id);
    expect(actorIds).toContain(alphaActorUserId);
    expect(actorIds).not.toContain(betaActorUserId);
  });

  it("RLS alone blocks the cross-tenant audit read, bypassing the application layer entirely", async () => {
    const rows = await prismaBase.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${alpha.tenantId}, true)`;
      return tx.auditLogEntry.findMany({});
    });
    const entityIds = rows.map((r) => r.entityId);
    expect(entityIds).toContain(alphaCustomerId);
    expect(entityIds).not.toContain(betaCustomerId);
  });

  it("RLS alone returns zero audit rows when no tenant context is set", async () => {
    const rows = await prismaBase.$transaction(async (tx) => tx.auditLogEntry.findMany({}));
    expect(rows).toHaveLength(0);
  });
});
