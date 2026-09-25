import { describe, expect, it } from "vitest";
import { diffMigrationState, isMigrationDiffClean, describeMigrationDiff, type MigrationRow } from "@/lib/bootstrap/migration-check";

describe("migration-set exact comparison", () => {
  it("is clean when repo and DB migration sets match exactly and all are finished", () => {
    const repo = new Set(["20260101_a", "20260102_b"]);
    const dbRows: MigrationRow[] = [
      { migration_name: "20260101_a", finished_at: new Date(), rolled_back_at: null },
      { migration_name: "20260102_b", finished_at: new Date(), rolled_back_at: null },
    ];
    const diff = diffMigrationState(repo, dbRows);
    expect(isMigrationDiffClean(diff)).toBe(true);
    expect(diff).toEqual({ missingInDb: [], unexpectedInDb: [], incomplete: [] });
  });

  it("flags a repo migration missing from the DB (DB is behind)", () => {
    const repo = new Set(["20260101_a", "20260102_b"]);
    const dbRows: MigrationRow[] = [{ migration_name: "20260101_a", finished_at: new Date(), rolled_back_at: null }];
    const diff = diffMigrationState(repo, dbRows);
    expect(isMigrationDiffClean(diff)).toBe(false);
    expect(diff.missingInDb).toEqual(["20260102_b"]);
    expect(diff.unexpectedInDb).toEqual([]);
  });

  it("flags a DB migration not present in the repo", () => {
    const repo = new Set(["20260101_a"]);
    const dbRows: MigrationRow[] = [
      { migration_name: "20260101_a", finished_at: new Date(), rolled_back_at: null },
      { migration_name: "20269999_mystery", finished_at: new Date(), rolled_back_at: null },
    ];
    const diff = diffMigrationState(repo, dbRows);
    expect(isMigrationDiffClean(diff)).toBe(false);
    expect(diff.unexpectedInDb).toEqual(["20269999_mystery"]);
  });

  it("flags an unfinished migration", () => {
    const repo = new Set(["20260101_a"]);
    const dbRows: MigrationRow[] = [{ migration_name: "20260101_a", finished_at: null, rolled_back_at: null }];
    const diff = diffMigrationState(repo, dbRows);
    expect(isMigrationDiffClean(diff)).toBe(false);
    expect(diff.incomplete).toEqual(["20260101_a"]);
  });

  it("does NOT flag a migration that failed once and then succeeded on retry (append-only history)", () => {
    // _prisma_migrations records every attempt, not one row per name - this
    // is the exact shape confirmed on this project's own local dev DB for
    // 20260919235839_add_catalog_i18n_sku_barcode.
    const repo = new Set(["20260101_a"]);
    const dbRows: MigrationRow[] = [
      { migration_name: "20260101_a", finished_at: null, rolled_back_at: new Date() },
      { migration_name: "20260101_a", finished_at: new Date(), rolled_back_at: null },
    ];
    const diff = diffMigrationState(repo, dbRows);
    expect(isMigrationDiffClean(diff)).toBe(true);
  });

  it("flags a migration whose only row(s) are all rolled back, with no successful retry", () => {
    const repo = new Set(["20260101_a"]);
    const dbRows: MigrationRow[] = [{ migration_name: "20260101_a", finished_at: null, rolled_back_at: new Date() }];
    const diff = diffMigrationState(repo, dbRows);
    expect(isMigrationDiffClean(diff)).toBe(false);
    expect(diff.incomplete).toEqual(["20260101_a"]);
  });

  it("flags a rolled-back migration even if finished_at is set", () => {
    const repo = new Set(["20260101_a"]);
    const dbRows: MigrationRow[] = [
      { migration_name: "20260101_a", finished_at: new Date(), rolled_back_at: new Date() },
    ];
    const diff = diffMigrationState(repo, dbRows);
    expect(isMigrationDiffClean(diff)).toBe(false);
    expect(diff.incomplete).toEqual(["20260101_a"]);
  });

  it("describeMigrationDiff produces a readable multi-line summary", () => {
    const diff = diffMigrationState(new Set(["a"]), [{ migration_name: "b", finished_at: new Date(), rolled_back_at: null }]);
    const description = describeMigrationDiff(diff);
    expect(description).toContain("Missing in DB: a");
    expect(description).toContain("Unexpected in DB (not in repo): b");
  });
});
