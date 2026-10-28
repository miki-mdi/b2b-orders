import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { withUserContext } from "@/lib/db/with-user-context";

/**
 * Phase 1 (schema/RLS foundation only - see docs/SESSION_HANDOFF.md's
 * cross-seller relationship design note) isolation proof for
 * TradingRelationship, mirroring tenant-isolation.test.ts's style and the
 * four guarantees it already proves for existing tables:
 *
 *   1. Seller A cannot read Seller B's relationship rows.
 *   2. Seller A cannot update Seller B's relationship rows.
 *   3. A buyer can discover ALL their own relationship rows (any status,
 *      across every tenant) via the same self-row exemption already proven
 *      for TenantMembership/CustomerMembership - and only their own.
 *   4. Missing tenant context fails safely (RLS returns zero rows / blocks
 *      the write - never an unscoped result).
 *
 * Deliberately does NOT use prisma/seed.ts's resetDatabase()/seedTenant() -
 * those wipe the entire local database (see prisma/seed.ts), which this
 * phase must not do to the developer's local data. Instead this suite
 * creates its own uniquely-named, disposable Tenant/User rows and deletes
 * them (cascading to every TradingRelationship row created here) in
 * afterAll, leaving no persistent trace.
 *
 * TradingRelationship is NOT (yet) in TENANT_SCOPED_MODELS
 * (src/lib/db/tenant-scoped-models.ts) - intentionally, since no domain
 * service calls it yet in this phase. That means, unlike Customer/Order/etc,
 * there is no Layer 2 (application-level) guard for this table yet - only
 * Layer 3 (RLS) enforces isolation here for now. The "missing context"
 * tests below verify the Layer 3 guarantee directly rather than asserting
 * TenantContextMissingError, which would require the Layer 2 registration
 * this phase deliberately defers to whichever phase adds real domain-service
 * code for TradingRelationship.
 */
describe("TradingRelationship isolation (Phase 1 schema/RLS foundation)", () => {
  const RUN_ID = `tr-iso-${Date.now()}`;

  let tenantA: { id: string };
  let tenantB: { id: string };
  let buyerA: { id: string };
  let buyerB: { id: string };
  let relationshipAId: string;

  beforeAll(async () => {
    tenantA = await prismaBase.tenant.create({
      data: { name: `${RUN_ID} Seller A`, slug: `${RUN_ID}-seller-a`, defaultVatRate: 18 },
    });
    tenantB = await prismaBase.tenant.create({
      data: { name: `${RUN_ID} Seller B`, slug: `${RUN_ID}-seller-b`, defaultVatRate: 18 },
    });
    buyerA = await prismaBase.user.create({
      data: { email: `${RUN_ID}-buyer-a@example.test`, name: "Buyer A", passwordHash: "not-a-real-hash" },
    });
    buyerB = await prismaBase.user.create({
      data: { email: `${RUN_ID}-buyer-b@example.test`, name: "Buyer B", passwordHash: "not-a-real-hash" },
    });

    const created = await withTenantContext(tenantA.id, (tx) =>
      tx.tradingRelationship.create({
        data: {
          tenantId: tenantA.id,
          userId: buyerA.id,
          status: "PENDING",
          initiatedBy: "BUYER",
          initiatedByUserId: buyerA.id,
        },
      })
    );
    relationshipAId = created.id;
  }, 30_000);

  afterAll(async () => {
    // Cascades to every TradingRelationship row this suite created.
    await prismaBase.tenant.delete({ where: { id: tenantA.id } }).catch(() => {});
    await prismaBase.tenant.delete({ where: { id: tenantB.id } }).catch(() => {});
    await prismaBase.user.delete({ where: { id: buyerA.id } }).catch(() => {});
    await prismaBase.user.delete({ where: { id: buyerB.id } }).catch(() => {});
    await prismaBase.$disconnect();
  });

  describe("1. seller A cannot read seller B's relationship rows", () => {
    it("excludes tenant A's row from a tenant-B-scoped query", async () => {
      const rows = await withTenantContext(tenantB.id, (tx) => tx.tradingRelationship.findMany({}));
      expect(rows.map((r) => r.id)).not.toContain(relationshipAId);
    });

    it("includes it from a tenant-A-scoped query", async () => {
      const rows = await withTenantContext(tenantA.id, (tx) => tx.tradingRelationship.findMany({}));
      expect(rows.map((r) => r.id)).toContain(relationshipAId);
    });

    it("RLS alone blocks the cross-tenant read, bypassing the application layer entirely", async () => {
      const rows = await prismaBase.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantB.id}, true)`;
        return tx.tradingRelationship.findMany({});
      });
      expect(rows.map((r) => r.id)).not.toContain(relationshipAId);
    });
  });

  describe("2. seller A cannot update seller B's relationship rows", () => {
    it("RLS rejects the write (0 rows affected) when scoped to the wrong tenant", async () => {
      const result = await prismaBase.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantB.id}, true)`;
        return tx.tradingRelationship.updateMany({
          where: { id: relationshipAId },
          data: { status: "DECLINED" },
        });
      });
      expect(result.count).toBe(0);

      const stillPending = await withTenantContext(tenantA.id, (tx) =>
        tx.tradingRelationship.findUniqueOrThrow({ where: { id: relationshipAId } })
      );
      expect(stillPending.status).toBe("PENDING");
    });
  });

  describe("3. a buyer can discover only their own relationship rows, across every tenant, with no tenant context", () => {
    it("the self-row exemption returns buyer A's row with zero tenant context set", async () => {
      const rows = await withUserContext(buyerA.id, (tx) =>
        tx.tradingRelationship.findMany({ where: { userId: buyerA.id } })
      );
      expect(rows.map((r) => r.id)).toContain(relationshipAId);
    });

    it("the self-row exemption is strictly self-scoped - buyer B never sees buyer A's row", async () => {
      const rows = await withUserContext(buyerB.id, (tx) =>
        tx.tradingRelationship.findMany({ where: { userId: buyerB.id } })
      );
      expect(rows.map((r) => r.id)).not.toContain(relationshipAId);
    });
  });

  describe("4. missing tenant context fails safely", () => {
    it("RLS returns zero rows - not an error, and never all rows - when no session variable is set", async () => {
      const rows = await prismaBase.$transaction(async (tx) => {
        // Deliberately do NOT call set_config here.
        return tx.tradingRelationship.findMany({});
      });
      expect(rows).toHaveLength(0);
    });

    it("RLS rejects an insert attempted with no tenant context set", async () => {
      await expect(
        prismaBase.$transaction(async (tx) => {
          // Deliberately do NOT call set_config here.
          return tx.tradingRelationship.create({
            data: {
              tenantId: tenantA.id,
              userId: buyerB.id,
              status: "PENDING",
              initiatedBy: "BUYER",
              initiatedByUserId: buyerB.id,
            },
          });
        })
      ).rejects.toThrow();
    });
  });

  describe("5. @@unique([userId, tenantId]) is enforced", () => {
    it("rejects a second relationship row for the same buyer/seller pair", async () => {
      await expect(
        withTenantContext(tenantA.id, (tx) =>
          tx.tradingRelationship.create({
            data: {
              tenantId: tenantA.id,
              userId: buyerA.id,
              status: "PENDING",
              initiatedBy: "SELLER",
              initiatedByUserId: buyerA.id,
            },
          })
        )
      ).rejects.toThrow();
    });
  });
});
