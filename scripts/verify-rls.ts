/**
 * CI hard gate: fails (non-zero exit) if the live database's RLS state
 * doesn't exactly match the committed canonical snapshot, or if
 * prisma/rls/policies.sql has drifted from what the migrations actually
 * apply. Never regenerates or writes the snapshot - only reads and
 * compares. See scripts/snapshot-rls.ts for the explicit developer command
 * that updates the snapshot.
 *
 * Two independent layers:
 *  - Layer 1 (static, no DB needed): every table prisma/rls/policies.sql
 *    documents as RLS-protected must have at least one CREATE POLICY
 *    statement for it somewhere across the full migration history. This is
 *    deliberately a coarse presence check, not a byte-exact duplication
 *    check: policies.sql documents the FINAL, cumulative policy state, but
 *    that state is assembled across multiple migrations in this repo's real
 *    history (confirmed directly - RLS statements exist in the init
 *    migration AND in two later fix migrations, 20260919214056 and
 *    20260920002706, which DROP and re-CREATE POLICY for tables whose rule
 *    changed after init). A byte-exact "policies.sql appears verbatim in
 *    one migration.sql" check was tried and is simply wrong for how this
 *    repo evolves RLS policies - it would fail on every legitimate
 *    incremental policy fix, which is not useful drift detection.
 *  - Layer 2 (dynamic, catalog-to-catalog diff): the live database's
 *    pg_class/pg_policies state, compared field-by-field against the
 *    committed snapshot - table RLS enabled/forced, and per policy:
 *    permissive mode, roles, cmd, USING, WITH CHECK. This deliberately
 *    never tries to parse or predict Postgres's deparsed qual/with_check
 *    text from policies.sql's raw SQL - that comparison would be comparing
 *    two different representations and could be fooled by harmless
 *    formatting differences. Comparing catalog output to catalog output
 *    (this snapshot vs. a live re-query) avoids that fragility entirely.
 */
import "./load-env";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { captureRlsSnapshot, diffRlsSnapshots, type RlsSnapshot } from "./lib/rls-catalog";

const RLS_DIR = path.join(process.cwd(), "prisma", "rls");
const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");
const SNAPSHOT_PATH = path.join(RLS_DIR, "expected-policies.json");

const normalizeLineEndings = (text: string) => text.replace(/\r\n/g, "\n");

function verifyPolicyStatementsPresentInMigrationHistory(): string[] {
  const policiesSql = normalizeLineEndings(readFileSync(path.join(RLS_DIR, "policies.sql"), "utf8"));

  const migrationDirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const allMigrationSql = migrationDirs
    .map((dir) => {
      try {
        return normalizeLineEndings(readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"));
      } catch {
        return "";
      }
    })
    .join("\n");

  const documentedTables = new Set<string>();
  const tableRegex = /ALTER TABLE "(\w+)" ENABLE ROW LEVEL SECURITY;/g;
  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(policiesSql))) {
    documentedTables.add(match[1]);
  }

  const problems: string[] = [];
  for (const table of [...documentedTables].sort()) {
    const hasPolicy = new RegExp(`CREATE POLICY \\S+ ON "${table}"`).test(allMigrationSql);
    if (!hasPolicy) {
      problems.push(
        `Table "${table}" is documented as RLS-protected in prisma/rls/policies.sql, but no migration ` +
          "anywhere in prisma/migrations/ creates a policy for it."
      );
    }
  }
  return problems;
}

async function main() {
  const problems: string[] = [];

  console.log("Layer 1: checking every table documented in prisma/rls/policies.sql has a policy somewhere in migration history...");
  problems.push(...verifyPolicyStatementsPresentInMigrationHistory());

  console.log("Layer 2: comparing live database RLS catalog state against the committed snapshot...");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set to the database to verify.");
  }

  let expected: RlsSnapshot;
  try {
    expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as RlsSnapshot;
  } catch (err) {
    throw new Error(
      `Could not read the committed snapshot at ${path.relative(process.cwd(), SNAPSHOT_PATH)}: ` +
        `${err instanceof Error ? err.message : String(err)}. Run "npm run rls:snapshot" against a freshly ` +
        "migrated database and commit the result."
    );
  }

  const actual = await captureRlsSnapshot(connectionString);
  problems.push(...diffRlsSnapshots(expected, actual));

  if (problems.length > 0) {
    console.error("\nRLS verification FAILED:\n");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(
      '\nIf this drift is intentional (a real RLS-affecting migration), regenerate the snapshot with ' +
        '"npm run rls:snapshot" against a freshly migrated database and commit the resulting diff for review.'
    );
    process.exitCode = 1;
    return;
  }

  console.log("\nRLS verification passed: live catalog state matches the committed snapshot exactly.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
