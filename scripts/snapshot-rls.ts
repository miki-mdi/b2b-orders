/**
 * Explicit developer command that (re)generates the committed canonical RLS
 * snapshot (prisma/rls/expected-policies.json) by capturing the live
 * pg_class/pg_policies state of a freshly migrated database.
 *
 * Run ONLY by a developer, ONLY when an intentional RLS-affecting migration
 * changes the expected state - never by CI. The resulting file is a normal,
 * reviewable git diff: `npm run rls:snapshot`, inspect the diff, commit it
 * alongside the migration that caused it.
 *
 * scripts/verify-rls.ts (the CI hard gate) only ever READS this file - it
 * never writes or regenerates it.
 */
import "./load-env";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { captureRlsSnapshot, normalizeSnapshot } from "./lib/rls-catalog";

const OUTPUT_PATH = path.join(process.cwd(), "prisma", "rls", "expected-policies.json");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must point at a freshly migrated database to generate the RLS snapshot.");
  }

  console.log("Capturing live RLS catalog state...");
  const snapshot = normalizeSnapshot(await captureRlsSnapshot(connectionString));

  writeFileSync(OUTPUT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

  console.log(
    `Wrote ${snapshot.tables.length} table row(s) and ${snapshot.policies.length} polic${
      snapshot.policies.length === 1 ? "y" : "ies"
    } to ${path.relative(process.cwd(), OUTPUT_PATH)}`
  );
  console.log("Review this diff carefully before committing - it is the canonical state CI verifies every run against.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
