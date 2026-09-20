import { afterAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { getDiagnosticsReport } from "@/lib/domain/diagnostics/diagnostics-service";

/**
 * Phase 1E, §5/§10: the diagnostics report is platform-admin-only (see
 * src/lib/auth/require-platform-admin.ts for the page-level guard, which
 * needs a request/session context this suite doesn't have), but the report
 * CONTENT itself must never carry a secret regardless of who ends up
 * reading it - that's what this test actually proves.
 */
describe("diagnostics report", () => {
  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("never serializes the DATABASE_URL, AUTH_SECRET, or a raw connection string", async () => {
    const report = await getDiagnosticsReport();
    const serialized = JSON.stringify(report);

    if (process.env.DATABASE_URL) {
      expect(serialized).not.toContain(process.env.DATABASE_URL);
    }
    if (process.env.AUTH_SECRET) {
      expect(serialized).not.toContain(process.env.AUTH_SECRET);
    }
    expect(serialized).not.toMatch(/postgres(ql)?:\/\//i);
  });

  it("reports the database as connected against the test database", async () => {
    const report = await getDiagnosticsReport();
    expect(report.database.connected).toBe(true);
    if (report.database.connected) {
      expect(report.database.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("reports migration state as an applied count plus the latest migration name", async () => {
    const report = await getDiagnosticsReport();
    expect(report.migrations.available).toBe(true);
    if (report.migrations.available) {
      expect(report.migrations.appliedCount).toBeGreaterThan(0);
      expect(typeof report.migrations.latestMigrationName).toBe("string");
    }
  });

  it("reports configuration checks as booleans, never the underlying value", async () => {
    const report = await getDiagnosticsReport();
    expect(typeof report.checks.databaseUrlConfigured).toBe("boolean");
    expect(typeof report.checks.authSecretConfigured).toBe("boolean");
    expect(report.checks.databaseUrlConfigured).toBe(true);
    expect(report.checks.authSecretConfigured).toBe(true);
  });
});
