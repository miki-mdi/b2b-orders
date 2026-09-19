import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withUserContext, UserContextMissingError } from "@/lib/db/with-user-context";
import { withTenantContext } from "@/lib/db/with-tenant";
import { resolveActiveMembership } from "@/lib/auth/active-membership";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";

/**
 * Regression tests for the login/membership-discovery RLS fix - see
 * prisma/rls/policies.sql's app.current_user_id write-up and
 * src/lib/db/with-user-context.ts. Before this fix, a real user could sign
 * in with the correct password and still resolve to NO active membership,
 * because TenantMembership/CustomerMembership's RLS silently hid their own
 * rows during the discovery step (no tenant context exists yet at that
 * point - that's the very thing being discovered).
 */
describe("membership discovery (login) via app.current_user_id", () => {
  let alpha: SeededTenant;
  let sellerAdminId: string;
  let buyerOneId: string;
  let buyerTwoId: string;
  let sampleTenantMembershipId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    alpha = await seedTenant("Alpha", "alpha-membership", passwordHash);
    sellerAdminId = (await prismaBase.user.findUniqueOrThrow({ where: { email: alpha.sellerAdminEmail } })).id;
    buyerOneId = (await prismaBase.user.findUniqueOrThrow({ where: { email: alpha.customers[0].buyerEmail } })).id;
    buyerTwoId = (await prismaBase.user.findUniqueOrThrow({ where: { email: alpha.customers[1].buyerEmail } })).id;
    sampleTenantMembershipId = (
      await withUserContext(sellerAdminId, (tx) => tx.tenantMembership.findFirstOrThrow({ where: { userId: sellerAdminId } }))
    ).id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("login can discover a user's TenantMembership", async () => {
    const identity = await resolveActiveMembership(sellerAdminId);
    expect(identity.isActive).toBe(true);
    expect(identity.activeMembership).toEqual({ type: "TENANT", tenantId: alpha.tenantId, role: "SELLER_ADMIN" });
  });

  it("login can discover a user's CustomerMembership", async () => {
    const identity = await resolveActiveMembership(buyerOneId);
    expect(identity.isActive).toBe(true);
    expect(identity.activeMembership).toEqual({
      type: "CUSTOMER",
      tenantId: alpha.tenantId,
      customerId: alpha.customers[0].id,
      role: "BUYER_ADMIN",
    });
  });

  it("user A cannot read user B's memberships through app.current_user_id", async () => {
    const buyerTwoRowsSeenAsBuyerOne = await withUserContext(buyerOneId, (tx) =>
      tx.customerMembership.findMany({ where: { userId: buyerTwoId } })
    );
    expect(buyerTwoRowsSeenAsBuyerOne).toHaveLength(0);

    // Confirm the exemption really only ever returns the querying user's
    // OWN rows, not "everyone's" (i.e. it isn't accidentally a blanket bypass).
    const ownRows = await withUserContext(buyerOneId, (tx) => tx.customerMembership.findMany({}));
    expect(ownRows.length).toBeGreaterThan(0);
    expect(ownRows.every((row) => row.userId === buyerOneId)).toBe(true);
  });

  describe("app.current_user_id alone cannot create, update, or delete a membership", () => {
    it("rejects a create with no tenant context, even with a valid user context", async () => {
      await expect(
        withUserContext(sellerAdminId, (tx) =>
          tx.tenantMembership.create({
            data: { userId: sellerAdminId, tenantId: alpha.tenantId, role: "SALES_REP" },
          })
        )
      ).rejects.toThrow();
    });

    it("rejects an update with no tenant context, even with a valid user context", async () => {
      await expect(
        withUserContext(sellerAdminId, (tx) =>
          tx.tenantMembership.update({
            where: { id: sampleTenantMembershipId },
            data: { role: "SALES_REP" },
          })
        )
      ).rejects.toThrow();

      // Confirm it's genuinely untouched - verified via the normal tenant-
      // scoped path (withTenantContext), not the unscoped prismaBase, which
      // would be blocked by the SAME RLS this test is exercising.
      const stillSellerAdmin = await withTenantContext(alpha.tenantId, (tx) =>
        tx.tenantMembership.findUniqueOrThrow({ where: { id: sampleTenantMembershipId } })
      );
      expect(stillSellerAdmin.role).toBe("SELLER_ADMIN");
    });

    it("rejects a delete with no tenant context, even with a valid user context", async () => {
      await expect(
        withUserContext(sellerAdminId, (tx) => tx.tenantMembership.delete({ where: { id: sampleTenantMembershipId } }))
      ).rejects.toThrow();

      const stillExists = await withTenantContext(alpha.tenantId, (tx) =>
        tx.tenantMembership.findUnique({ where: { id: sampleTenantMembershipId } })
      );
      expect(stillExists).not.toBeNull();
    });
  });

  describe("missing user context still fails safely", () => {
    it("withUserContext rejects an empty userId before touching the database", async () => {
      await expect(withUserContext("", async (tx) => tx.tenantMembership.findMany({}))).rejects.toThrow(
        UserContextMissingError
      );
    });

    it("RLS alone returns zero membership rows when neither tenant nor user context is set", async () => {
      const rows = await prismaBase.$transaction(async (tx) => {
        // Deliberately do NOT call set_config for anything here.
        return tx.tenantMembership.findMany({});
      });
      expect(rows).toHaveLength(0);
    });
  });
});
