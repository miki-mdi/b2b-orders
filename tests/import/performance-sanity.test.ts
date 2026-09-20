import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { confirmImport, previewImport } from "@/lib/domain/import/import-service";
import { csv } from "./helpers";

/**
 * Phase 1F-A, §18: a basic local sanity check at a realistic pilot-scale
 * row count (not a formal benchmark) - proves the import pipeline doesn't
 * fall over or take an unreasonable amount of time at 1,000 rows, and
 * gives real numbers to report rather than a guess. See the final report's
 * "performance sanity" section for the measured results and what they say
 * about the current per-row reference-resolution query pattern.
 */
describe("CSV import: performance sanity (1,000 rows)", () => {
  let tenant: SeededTenant;
  let actorUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Perf", "perf-import", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("previews and confirms 1,000 new customers in a reasonable local wall-clock bound", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => [`PERF-CUST-${i}`, `Perf Customer ${i}`, "true"]);
    const file = csv(["code", "name", "isActive"], rows);

    const previewStart = Date.now();
    const preview = await previewImport("customers", tenant.tenantId, actorUserId, file);
    const previewMs = Date.now() - previewStart;
    expect(preview.summary.created).toBe(1000);

    const confirmStart = Date.now();
    const result = await confirmImport("customers", tenant.tenantId, actorUserId, file, "perf-customers.csv");
    const confirmMs = Date.now() - confirmStart;
    expect(result.summary.created).toBe(1000);

    console.log(`[perf] customers import: preview=${previewMs}ms confirm=${confirmMs}ms for 1000 rows`);
    // Generous local bound - this is a sanity check, not a benchmark gate.
    expect(previewMs).toBeLessThan(60_000);
    expect(confirmMs).toBeLessThan(60_000);
  }, 120_000);

  it("previews and confirms 1,000 product units (with per-row FK reference resolution) in a reasonable bound", async () => {
    const productSku = "PERF-IMPORT-WIDGET";
    const rows = Array.from({ length: 1000 }, (_, i) => [
      `${productSku}-U${i}`,
      productSku,
      "pc",
      `Unit ${i}`,
      "1",
      "1",
      "false",
      "true",
    ]);
    const file = csv(
      ["sku", "productSku", "unitOfMeasureCode", "label", "minOrderQty", "orderIncrement", "isDefault", "isActive"],
      rows
    );

    const previewStart = Date.now();
    const preview = await previewImport("product-units", tenant.tenantId, actorUserId, file);
    const previewMs = Date.now() - previewStart;
    expect(preview.summary.created).toBe(1000);

    const confirmStart = Date.now();
    const result = await confirmImport("product-units", tenant.tenantId, actorUserId, file, "perf-product-units.csv");
    const confirmMs = Date.now() - confirmStart;
    expect(result.summary.created).toBe(1000);

    console.log(`[perf] product-units import (2 FK lookups/row): preview=${previewMs}ms confirm=${confirmMs}ms for 1000 rows`);
    expect(previewMs).toBeLessThan(60_000);
    expect(confirmMs).toBeLessThan(60_000);
  }, 120_000);

  it("a NO_CHANGE-heavy re-import of the same 1,000 customers completes without re-writing anything", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => [`PERF-CUST-${i}`, `Perf Customer ${i}`, "true"]);
    const file = csv(["code", "name", "isActive"], rows);

    const start = Date.now();
    const result = await confirmImport("customers", tenant.tenantId, actorUserId, file, "perf-customers-rerun.csv");
    const ms = Date.now() - start;
    expect(result.summary).toMatchObject({ created: 0, updated: 0, unchanged: 1000, rejected: 0 });
    console.log(`[perf] customers re-import (all NO_CHANGE): ${ms}ms for 1000 rows`);
    expect(ms).toBeLessThan(60_000);
  }, 120_000);
});
