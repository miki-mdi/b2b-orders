import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { prisma as scopedPrisma } from "@/lib/db/scoped-client";
import { withCustomerContext, withTenantContext } from "@/lib/db/with-tenant";
import { CustomerContextMissingError, TenantContextMissingError } from "@/lib/db/tenant-context";
import { getCustomer, listCustomers } from "@/lib/domain/customers/customer-service";
import { getOrderForCustomer, listOrdersForCustomer } from "@/lib/domain/orders/order-service";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";

/**
 * Proves the four isolation guarantees required before Phase 0 is considered
 * done (docs/MVP_SCOPE.md §3, docs/SECURITY_AND_MULTI_TENANCY.md §9):
 *
 *   1. Tenant A cannot read Tenant B's data.
 *   2. Tenant A cannot update Tenant B's data.
 *   3. A buyer/customer cannot access another customer's protected records.
 *   4. Missing tenant context fails safely (throws / zero rows - never an
 *      unscoped result).
 *
 * Each of 1-3 is tested twice: once through the normal application path
 * (domain services -> withTenantContext/withCustomerContext -> Layer 2 +
 * Layer 3 together), and once bypassing Layer 2 entirely by calling the
 * UNSCOPED prismaBase client directly with only the RLS session variable
 * set - proving Layer 3 (the database itself) enforces isolation
 * independently, not just because the application remembered to filter.
 */
describe("tenant and customer isolation", () => {
  let alpha: SeededTenant;
  let beta: SeededTenant;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    alpha = await seedTenant("Alpha", "alpha-test", passwordHash);
    beta = await seedTenant("Beta", "beta-test", passwordHash);
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  describe("1. tenant A cannot read tenant B's data", () => {
    it("returns null fetching another tenant's customer by id (application path)", async () => {
      const result = await getCustomer(alpha.tenantId, beta.customers[0].id);
      expect(result).toBeNull();
    });

    it("excludes another tenant's rows from a list query (application path)", async () => {
      const result = await listCustomers(alpha.tenantId);
      const ids = result.map((c) => c.id);
      expect(ids).toEqual(expect.arrayContaining(alpha.customers.map((c) => c.id)));
      expect(ids).not.toEqual(expect.arrayContaining(beta.customers.map((c) => c.id)));
    });

    it("RLS alone blocks the cross-tenant read, bypassing the application layer entirely", async () => {
      const rows = await prismaBase.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${alpha.tenantId}, true)`;
        return tx.customer.findMany({});
      });
      const ids = rows.map((c) => c.id);
      expect(ids).toEqual(expect.arrayContaining(alpha.customers.map((c) => c.id)));
      expect(ids).not.toEqual(expect.arrayContaining(beta.customers.map((c) => c.id)));
    });
  });

  describe("2. tenant A cannot update tenant B's data", () => {
    it("throws attempting to update another tenant's customer, and the row is untouched (application path)", async () => {
      await expect(
        withTenantContext(alpha.tenantId, (tx) =>
          tx.customer.update({
            where: { id: beta.customers[0].id },
            data: { name: "Hacked by Alpha" },
          })
        )
      ).rejects.toThrow();

      const stillBeta = await withTenantContext(beta.tenantId, (tx) =>
        tx.customer.findUniqueOrThrow({ where: { id: beta.customers[0].id } })
      );
      expect(stillBeta.name).toBe(beta.customers[0].name);
    });

    it("RLS alone rejects the write (0 rows affected), bypassing the application layer entirely", async () => {
      const result = await prismaBase.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${alpha.tenantId}, true)`;
        return tx.customer.updateMany({
          where: { id: beta.customers[0].id },
          data: { name: "Hacked via raw client" },
        });
      });
      expect(result.count).toBe(0);
    });
  });

  describe("3. a buyer/customer cannot access another customer's protected records", () => {
    it("returns null fetching an order placed by a different customer in the same tenant", async () => {
      const [customerOne, customerTwo] = alpha.customers;

      const crossCustomerResult = await getOrderForCustomer(alpha.tenantId, customerTwo.id, alpha.sampleOrderId);
      expect(crossCustomerResult).toBeNull();

      const ownResult = await getOrderForCustomer(alpha.tenantId, customerOne.id, alpha.sampleOrderId);
      expect(ownResult).not.toBeNull();
    });

    it("excludes another customer's orders from a list query", async () => {
      const [customerOne, customerTwo] = alpha.customers;

      const ordersForTwo = await listOrdersForCustomer(alpha.tenantId, customerTwo.id);
      expect(ordersForTwo.map((o) => o.id)).not.toContain(alpha.sampleOrderId);

      const ordersForOne = await listOrdersForCustomer(alpha.tenantId, customerOne.id);
      expect(ordersForOne.map((o) => o.id)).toContain(alpha.sampleOrderId);
    });

    it("cannot read another customer's saved address, even within the same tenant", async () => {
      const [customerOne, customerTwo] = alpha.customers;

      const ownAddresses = await withCustomerContext(alpha.tenantId, customerOne.id, (tx) =>
        tx.customerAddress.findMany({})
      );
      expect(ownAddresses.length).toBeGreaterThan(0);
      expect(ownAddresses.every((a) => a.customerId === customerOne.id)).toBe(true);

      // Fetch that specific, known address row by id while scoped as a
      // DIFFERENT customer. Deliberately not re-filtering by customerId
      // here - the Layer 2 extension always overwrites a caller-supplied
      // customerId with the active session's own (that's the point of it),
      // so a where-clause-based attempt would just silently return
      // customerTwo's own rows instead of testing anything. Fetching by the
      // real row id is what actually exercises "can customerTwo's session
      // reach a row it doesn't own."
      const seenAsCustomerTwo = await withCustomerContext(alpha.tenantId, customerTwo.id, (tx) =>
        tx.customerAddress.findUnique({ where: { id: ownAddresses[0].id } })
      );
      expect(seenAsCustomerTwo).toBeNull();
    });
  });

  describe("4. missing tenant context fails safely", () => {
    it("the app-level scoped client throws rather than returning unscoped data", async () => {
      await expect(scopedPrisma.customer.findMany()).rejects.toThrow(TenantContextMissingError);
    });

    it("withTenantContext rejects an empty tenantId before touching the database", async () => {
      await expect(withTenantContext("", async (tx) => tx.customer.findMany())).rejects.toThrow(
        TenantContextMissingError
      );
    });

    it("withCustomerContext rejects a missing customerId before touching the database", async () => {
      await expect(withCustomerContext(alpha.tenantId, "", async (tx) => tx.order.findMany())).rejects.toThrow(
        CustomerContextMissingError
      );
    });

    it("RLS alone returns zero rows - not an error, and never all rows - when no session variable is set", async () => {
      const rows = await prismaBase.$transaction(async (tx) => {
        // Deliberately do NOT call set_config here.
        return tx.customer.findMany({});
      });
      expect(rows).toHaveLength(0);
    });
  });
});
