import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import type { ParsedCsv } from "./csv-parser";
import { headerIndex } from "./csv-parser";
import type { ImportRowError, ImportRowPlan } from "./types";

/**
 * Entity-specific hooks the shared driver (planAndExecuteRows) calls per
 * row. Each <entity>-import.ts supplies exactly these six functions -
 * keeps "how to parse/validate/write a Category row" separate from "how to
 * iterate a file, detect in-file duplicates, and decide preview vs. write"
 * (Phase 1F-A, §15).
 *
 * `TValidated` is the entity's normal zod-inferred Input type (e.g.
 * CategoryInput) - reusing the SAME schema the manual UI form already uses,
 * so a business rule (SKU regex, min-qty-vs-increment, etc.) is defined
 * exactly once. `TExisting` is whatever shape resolve() returns for a
 * matched DB row (at minimum `{ id: string }` plus enough fields for diff
 * to compare against).
 */
export type EntityImportOps<TValidated, TExisting extends { id: string }> = {
  /** Raw CSV cells for one row -> either a schema-validated candidate, or validation errors. Never throws. */
  normalizeRow(row: string[], index: Map<string, number>): { data?: TValidated; errors: ImportRowError[]; warnings: string[] };
  /** Human-readable business key for this row's candidate (dedupe + display). */
  keyOf(data: TValidated): string;
  /** Tenant-scoped lookup of the existing row (if any) by business key, plus resolution of every FK reference column. Never trusts an id from the CSV. */
  resolve(
    tx: ScopedTransactionClient,
    tenantId: string,
    data: TValidated
  ): Promise<{ refs: unknown; existing: TExisting | null; errors: ImportRowError[] }>;
  /**
   * Compares the existing row against the candidate, honoring "a column
   * absent from the header leaves the existing value untouched" - returns
   * the fully-merged payload ready to hand to the entity's `...InTx` update
   * function (never a partial object), plus which fields actually changed
   * for preview display.
   */
  diff(existing: TExisting, data: TValidated, refs: unknown): { changed: boolean; changedFields: string[]; updateData: TValidated };
  executeCreate(tx: ScopedTransactionClient, tenantId: string, actorUserId: string, data: TValidated, refs: unknown, reason: string): Promise<{ id: string }>;
  executeUpdate(tx: ScopedTransactionClient, tenantId: string, actorUserId: string, existing: TExisting, updateData: TValidated, refs: unknown, reason: string): Promise<{ id: string }>;
};

export type DriverResult = {
  rows: ImportRowPlan[];
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
};

/**
 * Runs every parsed data row through normalize -> in-file-duplicate check
 * -> resolve -> diff -> (confirm mode only) execute, in file order, inside
 * the ALREADY-OPEN tenant-scoped transaction the caller provides. Used
 * identically by previewImport (mode "preview", never writes) and
 * confirmImport (mode "confirm", writes CREATE/UPDATE rows) - see
 * import-service.ts. This is the one place the "never write during
 * preview" and "duplicate key in file rejects every row sharing it"
 * requirements are enforced, so every entity gets them for free.
 */
export async function planAndExecuteRows<TValidated, TExisting extends { id: string }>(
  tx: ScopedTransactionClient,
  tenantId: string,
  actorUserId: string,
  parsed: ParsedCsv,
  ops: EntityImportOps<TValidated, TExisting>,
  mode: "preview" | "confirm",
  batchReason: string
): Promise<DriverResult> {
  const index = headerIndex(parsed.headers);

  type Interim = { row: number; data?: TValidated; key: string; errors: ImportRowError[]; warnings: string[] };
  const interim: Interim[] = parsed.rows.map((rowValues, i) => {
    const rowNumber = parsed.rowNumbers[i];
    const { data, errors, warnings } = ops.normalizeRow(rowValues, index);
    const key = data ? ops.keyOf(data) : `(row ${rowNumber})`;
    return { row: rowNumber, data, key, errors, warnings };
  });

  // A business key repeated across rows is an ERROR on every row sharing
  // it, first occurrence included - requirement #5's "never silently
  // overwrite based on ambiguous matching." Only rows that normalized
  // successfully (and so have a real key, not a placeholder) count.
  const keyCounts = new Map<string, number>();
  for (const r of interim) {
    if (r.data) keyCounts.set(r.key, (keyCounts.get(r.key) ?? 0) + 1);
  }

  const rows: ImportRowPlan[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let rejected = 0;

  for (const r of interim) {
    const errors = [...r.errors];
    if (r.data && (keyCounts.get(r.key) ?? 0) > 1) {
      errors.push({ code: "DUPLICATE_KEY_IN_FILE", message: `Key "${r.key}" appears on more than one row in this file.` });
    }

    if (!r.data || errors.length > 0) {
      rejected += 1;
      rows.push({ row: r.row, status: "ERROR", key: r.key, errors, warnings: r.warnings });
      continue;
    }

    const { refs, existing, errors: refErrors } = await ops.resolve(tx, tenantId, r.data);
    if (refErrors.length > 0) {
      rejected += 1;
      rows.push({ row: r.row, status: "ERROR", key: r.key, errors: refErrors, warnings: r.warnings });
      continue;
    }

    if (!existing) {
      let entityId: string | undefined;
      if (mode === "confirm") {
        const result = await ops.executeCreate(tx, tenantId, actorUserId, r.data, refs, batchReason);
        entityId = result.id;
      }
      created += 1;
      rows.push({ row: r.row, status: "CREATE", key: r.key, entityId, errors: [], warnings: r.warnings });
      continue;
    }

    const { changed, changedFields, updateData } = ops.diff(existing, r.data, refs);
    if (!changed) {
      unchanged += 1;
      rows.push({ row: r.row, status: "NO_CHANGE", key: r.key, entityId: existing.id, errors: [], warnings: r.warnings });
      continue;
    }

    if (mode === "confirm") {
      await ops.executeUpdate(tx, tenantId, actorUserId, existing, updateData, refs, batchReason);
    }
    updated += 1;
    rows.push({ row: r.row, status: "UPDATE", key: r.key, entityId: existing.id, errors: [], warnings: r.warnings, changedFields });
  }

  return { rows, created, updated, unchanged, rejected };
}
