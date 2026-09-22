import { describe, expect, it } from "vitest";
import { withTenantContext } from "@/lib/db/with-tenant";

/**
 * Phase 1F-B2 closure: withTenantContext gained an optional third
 * `options` parameter, forwarded as-is to Prisma's own `$transaction`
 * (maxWait/timeout/isolationLevel) - see with-tenant.ts's own doc comment
 * for the full reasoning. These tests prove the mechanism itself, in
 * isolation from the CSV import feature that motivated it: that an
 * explicit timeout is genuinely respected (both to fail fast when it's too
 * short, and to succeed where the 5s default would fail), and that every
 * existing two-argument call site is completely unaffected.
 *
 * No seeded tenant/database fixture is needed - requireTenantId only checks
 * for a non-empty string (src/lib/db/tenant-context.ts), and the queries
 * here only need to run inside a real Postgres transaction, not return any
 * particular rows.
 */
const FAKE_TENANT_ID = "with-tenant-transaction-options-test-tenant";

describe("withTenantContext: transaction options", () => {
  it("existing two-argument callers behave exactly as before (no options = Prisma's defaults)", async () => {
    const rows = await withTenantContext(FAKE_TENANT_ID, (tx) => tx.category.findMany({ take: 1 }));
    expect(rows).toEqual([]);
  });

  it("an explicit short timeout is respected: a transaction that outlives it is aborted", async () => {
    const promise = withTenantContext(
      FAKE_TENANT_ID,
      async (tx) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return tx.category.findMany({ take: 1 }); // any query after the sleep should hit the expired transaction
      },
      { timeout: 50 }
    );
    await expect(promise).rejects.toThrow(/transaction/i);
  }, 10_000);

  it("an explicit longer timeout allows a transaction that exceeds the 5s default to complete", async () => {
    // Sleeping past Prisma's 5000ms client default proves the explicit
    // option - not just luck - is what makes this succeed.
    const result = await withTenantContext(
      FAKE_TENANT_ID,
      async (tx) => {
        await new Promise((resolve) => setTimeout(resolve, 5_300));
        return tx.category.findMany({ take: 1 });
      },
      { timeout: 8_000 }
    );
    expect(result).toEqual([]);
  }, 15_000);
});
