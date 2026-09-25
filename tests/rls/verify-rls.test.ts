import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { captureRlsSnapshot, diffRlsSnapshots, type RlsSnapshot } from "../../scripts/lib/rls-catalog";
import { prismaBase } from "@/lib/db/prisma";

const SNAPSHOT_PATH = path.join(process.cwd(), "prisma", "rls", "expected-policies.json");

describe("RLS verifier against the freshly migrated local/test database", () => {
  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("live catalog state matches the committed snapshot exactly", async () => {
    const connectionString = process.env.DATABASE_URL;
    expect(connectionString).toBeTruthy();

    const expected: RlsSnapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
    const actual = await captureRlsSnapshot(connectionString!);

    const problems = diffRlsSnapshots(expected, actual);
    expect(problems).toEqual([]);
  });

  it("committed snapshot has every tenant-scoped table forced (sanity check on the snapshot itself)", () => {
    const snapshot: RlsSnapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
    const scopedTables = snapshot.tables.filter((t) => t.rlsEnabled);
    expect(scopedTables.length).toBeGreaterThan(0);
    for (const table of scopedTables) {
      expect(table.rlsForced, `${table.tableName} should have FORCE ROW LEVEL SECURITY`).toBe(true);
    }
  });

  it("Tenant and User are NOT RLS-protected in the committed snapshot", () => {
    const snapshot: RlsSnapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
    for (const name of ["Tenant", "User"]) {
      const table = snapshot.tables.find((t) => t.tableName === name);
      expect(table, `${name} should be present in the snapshot`).toBeTruthy();
      expect(table!.rlsEnabled).toBe(false);
      expect(table!.rlsForced).toBe(false);
    }
  });
});

describe("diffRlsSnapshots - synthetic drift detection", () => {
  const base: RlsSnapshot = {
    tables: [{ tableName: "Category", rlsEnabled: true, rlsForced: true }],
    policies: [
      {
        tableName: "Category",
        policyName: "tenant_isolation",
        permissive: "PERMISSIVE",
        roles: ["public"],
        cmd: "ALL",
        qual: '("tenantId" = current_setting(\'app.current_tenant_id\'::text, true))',
        withCheck: '("tenantId" = current_setting(\'app.current_tenant_id\'::text, true))',
      },
    ],
  };

  it("reports no problems when identical", () => {
    expect(diffRlsSnapshots(base, base)).toEqual([]);
  });

  it("catches rls_enabled drift", () => {
    const actual: RlsSnapshot = { ...base, tables: [{ ...base.tables[0], rlsEnabled: false }] };
    const problems = diffRlsSnapshots(base, actual);
    expect(problems.some((p) => p.includes("rls_enabled"))).toBe(true);
  });

  it("catches rls_forced drift", () => {
    const actual: RlsSnapshot = { ...base, tables: [{ ...base.tables[0], rlsForced: false }] };
    const problems = diffRlsSnapshots(base, actual);
    expect(problems.some((p) => p.includes("rls_forced"))).toBe(true);
  });

  it("catches an unexpected RLS-forced non-scoped table", () => {
    const actual: RlsSnapshot = {
      tables: [...base.tables, { tableName: "Tenant", rlsEnabled: true, rlsForced: true }],
      policies: base.policies,
    };
    const expected: RlsSnapshot = {
      tables: [...base.tables, { tableName: "Tenant", rlsEnabled: false, rlsForced: false }],
      policies: base.policies,
    };
    const problems = diffRlsSnapshots(expected, actual);
    expect(problems.some((p) => p.includes('"Tenant"') && p.includes("rls_enabled"))).toBe(true);
  });

  it("catches a missing policy", () => {
    const actual: RlsSnapshot = { ...base, policies: [] };
    const problems = diffRlsSnapshots(base, actual);
    expect(problems.some((p) => p.includes("missing from live DB"))).toBe(true);
  });

  it("catches an unexpected extra policy", () => {
    const actual: RlsSnapshot = {
      ...base,
      policies: [
        ...base.policies,
        { ...base.policies[0], policyName: "stray_leftover_policy" },
      ],
    };
    const problems = diffRlsSnapshots(base, actual);
    expect(problems.some((p) => p.includes("Unexpected policy") && p.includes("stray_leftover_policy"))).toBe(true);
  });

  it("catches a cmd change (e.g. FOR ALL narrowed to FOR SELECT)", () => {
    const actual: RlsSnapshot = { ...base, policies: [{ ...base.policies[0], cmd: "SELECT" }] };
    const problems = diffRlsSnapshots(base, actual);
    expect(problems.some((p) => p.includes("cmd"))).toBe(true);
  });

  it("catches a permissive/restrictive mode change", () => {
    const actual: RlsSnapshot = { ...base, policies: [{ ...base.policies[0], permissive: "RESTRICTIVE" }] };
    const problems = diffRlsSnapshots(base, actual);
    expect(problems.some((p) => p.includes("permissive"))).toBe(true);
  });

  it("catches a roles change", () => {
    const actual: RlsSnapshot = { ...base, policies: [{ ...base.policies[0], roles: ["b2b_orders_app"] }] };
    const problems = diffRlsSnapshots(base, actual);
    expect(problems.some((p) => p.includes("roles"))).toBe(true);
  });

  it("catches a USING (qual) expression change", () => {
    const actual: RlsSnapshot = { ...base, policies: [{ ...base.policies[0], qual: "(true)" }] };
    const problems = diffRlsSnapshots(base, actual);
    expect(problems.some((p) => p.includes("USING expression"))).toBe(true);
  });

  it("catches a WITH CHECK expression change", () => {
    const actual: RlsSnapshot = { ...base, policies: [{ ...base.policies[0], withCheck: "(true)" }] };
    const problems = diffRlsSnapshots(base, actual);
    expect(problems.some((p) => p.includes("WITH CHECK expression"))).toBe(true);
  });
});
