import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { prismaBase } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";

/**
 * Regression test for the connection-reuse bug found (and fixed) during
 * Phase 0 - see prisma/rls/policies.sql's "NULLIF" comment and
 * prisma/migrations/*_fix_customer_context_nullif/migration.sql for the
 * full write-up.
 *
 * Once a pooled connection has had `app.current_customer_id` set via
 * set_config(..., true) at least once - even inside a transaction that
 * later commits - Postgres leaves that custom parameter "known" on the
 * connection. A LATER transaction on that SAME reused connection that never
 * sets it again sees `current_setting(..., true)` return '' (empty
 * string), not NULL. The RLS policies must treat both as "no customer
 * restriction, this is a tenant-only session" - not treat '' as if it were
 * an actual (nonexistent) customer id, which would silently zero out a
 * seller session's visibility instead of erroring or leaking data.
 *
 * This test forces the scenario deterministically with a dedicated
 * single-connection pool (max: 1) rather than hoping the default pool
 * happens to reuse a connection between two calls.
 */
describe("connection reuse does not leak a stale customer context", () => {
  const singleConnectionAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 });
  const singleConnectionPrisma = new PrismaClient({ adapter: singleConnectionAdapter });

  let alpha: SeededTenant;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    alpha = await seedTenant("Alpha", "alpha-conn-reuse", passwordHash);
  }, 30_000);

  afterAll(async () => {
    await singleConnectionPrisma.$disconnect();
    await prismaBase.$disconnect();
  });

  it("a tenant-only transaction after a customer-scoped one (same connection) sees ALL of the tenant's customers, not zero", async () => {
    const [customerOne] = alpha.customers;

    // Transaction A: a buyer session sets app.current_customer_id.
    await singleConnectionPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${alpha.tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_customer_id', ${customerOne.id}, true)`;
      const ownRow = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Customer" WHERE id = ${customerOne.id}`;
      expect(ownRow).toHaveLength(1);
    });

    // Transaction B: a seller session, guaranteed to run on the SAME
    // physical connection (pool max: 1), which never sets
    // app.current_customer_id at all.
    const sellerVisibleCustomers = await singleConnectionPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${alpha.tenantId}, true)`;
      return tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Customer" WHERE "tenantId" = ${alpha.tenantId}`;
    });

    // Before the fix, this incorrectly returned 0 rows - restricted to the
    // stale '' "customer id" left over from transaction A - instead of both
    // of the tenant's customers.
    expect(sellerVisibleCustomers.map((c) => c.id).sort()).toEqual(alpha.customers.map((c) => c.id).sort());
  });

  it("documents why the fix is necessary: the raw session variable is observably '' (not NULL) on a reused connection", async () => {
    const [customerOne] = alpha.customers;

    await singleConnectionPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${alpha.tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_customer_id', ${customerOne.id}, true)`;
    });

    const raw = await singleConnectionPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${alpha.tenantId}, true)`;
      return tx.$queryRaw<{ v: string | null }[]>`SELECT current_setting('app.current_customer_id', true) AS v`;
    });

    // If a future Postgres version changes this underlying behavior, this
    // assertion (not the RLS policies) is the one that should start
    // failing - at which point the NULLIF workaround becomes unnecessary
    // but remains harmless.
    expect(raw[0].v).toBe("");
  });
});
