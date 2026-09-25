// Shared catalog-query logic for scripts/snapshot-rls.ts (generates the
// committed canonical snapshot) and scripts/verify-rls.ts (compares a live
// database against it). Uses `pg` directly rather than the Prisma client
// deliberately - this is independent verification tooling, and going
// through the same ORM layer being verified would weaken that.
import { Client } from "pg";

export type RlsTableState = {
  tableName: string;
  rlsEnabled: boolean;
  rlsForced: boolean;
};

export type RlsPolicy = {
  tableName: string;
  policyName: string;
  permissive: string;
  roles: string[];
  cmd: string;
  qual: string | null;
  withCheck: string | null;
};

export type RlsSnapshot = {
  tables: RlsTableState[];
  policies: RlsPolicy[];
};

// pg_tables has no forcerowsecurity column - pg_class/pg_namespace are the
// actual source of both flags (see docs/SESSION_HANDOFF.md's deployment
// notes on this exact correction).
const TABLES_QUERY = `
  SELECT c.relname AS table_name,
         c.relrowsecurity AS rls_enabled,
         c.relforcerowsecurity AS rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname;
`;

const POLICIES_QUERY = `
  SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
`;

export async function captureRlsSnapshot(connectionString: string): Promise<RlsSnapshot> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const tablesResult = await client.query(TABLES_QUERY);
    const policiesResult = await client.query(POLICIES_QUERY);

    const tables: RlsTableState[] = tablesResult.rows.map((r) => ({
      tableName: r.table_name,
      rlsEnabled: r.rls_enabled,
      rlsForced: r.rls_forced,
    }));

    const policies: RlsPolicy[] = policiesResult.rows.map((r) => ({
      tableName: r.tablename,
      policyName: r.policyname,
      permissive: r.permissive,
      roles: r.roles,
      cmd: r.cmd,
      qual: r.qual,
      withCheck: r.with_check,
    }));

    return { tables, policies };
  } finally {
    await client.end();
  }
}

function sortSnapshot(snapshot: RlsSnapshot): RlsSnapshot {
  return {
    tables: [...snapshot.tables].sort((a, b) => a.tableName.localeCompare(b.tableName)),
    policies: [...snapshot.policies].sort((a, b) =>
      (a.tableName + "::" + a.policyName).localeCompare(b.tableName + "::" + b.policyName)
    ),
  };
}

export function normalizeSnapshot(snapshot: RlsSnapshot): RlsSnapshot {
  return sortSnapshot({
    tables: snapshot.tables,
    policies: snapshot.policies.map((p) => ({ ...p, roles: [...p.roles].sort() })),
  });
}

/**
 * Compares two snapshots and returns a list of human-readable problem
 * descriptions - empty means they match exactly. Deliberately bidirectional
 * (checks for both missing AND unexpected entries on both tables and
 * policies), and checks every field the approved design requires: table
 * rls_enabled/rls_forced, and per policy: permissive, roles, cmd, USING
 * (qual), WITH CHECK.
 */
export function diffRlsSnapshots(expectedRaw: RlsSnapshot, actualRaw: RlsSnapshot): string[] {
  const expected = normalizeSnapshot(expectedRaw);
  const actual = normalizeSnapshot(actualRaw);
  const problems: string[] = [];

  const expectedTables = new Map(expected.tables.map((t) => [t.tableName, t]));
  const actualTables = new Map(actual.tables.map((t) => [t.tableName, t]));
  const allTableNames = new Set([...expectedTables.keys(), ...actualTables.keys()]);

  for (const name of [...allTableNames].sort()) {
    const exp = expectedTables.get(name);
    const act = actualTables.get(name);
    if (!exp) {
      problems.push(`Unexpected table in live DB not present in snapshot: "${name}"`);
      continue;
    }
    if (!act) {
      problems.push(`Table "${name}" is in the snapshot but missing from the live DB`);
      continue;
    }
    if (exp.rlsEnabled !== act.rlsEnabled) {
      problems.push(`Table "${name}": rls_enabled expected ${exp.rlsEnabled}, got ${act.rlsEnabled}`);
    }
    if (exp.rlsForced !== act.rlsForced) {
      problems.push(`Table "${name}": rls_forced expected ${exp.rlsForced}, got ${act.rlsForced}`);
    }
  }

  const policyKey = (p: RlsPolicy) => `${p.tableName}::${p.policyName}`;
  const expectedPolicies = new Map(expected.policies.map((p) => [policyKey(p), p]));
  const actualPolicies = new Map(actual.policies.map((p) => [policyKey(p), p]));
  const allPolicyKeys = new Set([...expectedPolicies.keys(), ...actualPolicies.keys()]);

  for (const key of [...allPolicyKeys].sort()) {
    const exp = expectedPolicies.get(key);
    const act = actualPolicies.get(key);
    if (!exp) {
      problems.push(`Unexpected policy in live DB not present in snapshot: ${key}`);
      continue;
    }
    if (!act) {
      problems.push(`Policy in snapshot but missing from live DB: ${key}`);
      continue;
    }
    if (exp.permissive !== act.permissive) {
      problems.push(`Policy ${key}: permissive/restrictive mode expected "${exp.permissive}", got "${act.permissive}"`);
    }
    if (exp.cmd !== act.cmd) {
      problems.push(`Policy ${key}: cmd expected "${exp.cmd}", got "${act.cmd}"`);
    }
    if (JSON.stringify(exp.roles) !== JSON.stringify(act.roles)) {
      problems.push(`Policy ${key}: roles expected ${JSON.stringify(exp.roles)}, got ${JSON.stringify(act.roles)}`);
    }
    if (exp.qual !== act.qual) {
      problems.push(`Policy ${key}: USING expression differs from the committed snapshot`);
    }
    if (exp.withCheck !== act.withCheck) {
      problems.push(`Policy ${key}: WITH CHECK expression differs from the committed snapshot`);
    }
  }

  return problems;
}
