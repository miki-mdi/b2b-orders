// Exact-set comparison between the migrations this repo ships and the
// migrations a target database has actually, successfully applied. Pure and
// DB-free except for the one filesystem read - the DB row shape is passed
// in, not queried here, so the diff logic itself is fully unit-testable.
import { readdirSync } from "node:fs";

export function getRepoMigrationNames(migrationsDir: string): Set<string> {
  return new Set(
    readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  );
}

export type MigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

export type MigrationDiff = {
  missingInDb: string[];
  unexpectedInDb: string[];
  incomplete: string[];
};

export function diffMigrationState(repoNames: Set<string>, dbRows: MigrationRow[]): MigrationDiff {
  const dbNames = new Set(dbRows.map((r) => r.migration_name));

  const missingInDb = [...repoNames].filter((n) => !dbNames.has(n)).sort();
  const unexpectedInDb = [...dbNames].filter((n) => !repoNames.has(n)).sort();

  // _prisma_migrations is an append-only history, not one row per migration
  // name: a migration that failed once and was retried successfully has TWO
  // rows under the same name (one rolled back, one finished) - confirmed
  // directly against this project's own local dev database, where
  // 20260919235839_add_catalog_i18n_sku_barcode has exactly this shape and
  // is, correctly, a fully-applied migration as far as Prisma itself is
  // concerned. A migration only counts as incomplete if NONE of its rows
  // succeeded - checking every individual row independently (the original,
  // wrong version of this function) produces a false positive on any
  // migration that was ever retried after a transient failure.
  const successfulNames = new Set(
    dbRows.filter((r) => r.finished_at !== null && r.rolled_back_at === null).map((r) => r.migration_name)
  );
  const incomplete = [...dbNames].filter((n) => !successfulNames.has(n)).sort();

  return { missingInDb, unexpectedInDb, incomplete };
}

export function isMigrationDiffClean(diff: MigrationDiff): boolean {
  return diff.missingInDb.length === 0 && diff.unexpectedInDb.length === 0 && diff.incomplete.length === 0;
}

export function describeMigrationDiff(diff: MigrationDiff): string {
  const lines: string[] = [];
  if (diff.missingInDb.length) lines.push(`Missing in DB: ${diff.missingInDb.join(", ")}`);
  if (diff.unexpectedInDb.length) lines.push(`Unexpected in DB (not in repo): ${diff.unexpectedInDb.join(", ")}`);
  if (diff.incomplete.length) lines.push(`Incomplete/rolled back in DB: ${diff.incomplete.join(", ")}`);
  return lines.join("\n");
}
