/**
 * Shared types for every <entity>-import.ts pipeline (Phase 1F-A, §15).
 *
 * Two different kinds of failure are deliberately NOT handled the same way
 * (see import-service.ts for where this distinction is enforced):
 *
 *  - A row planned as ERROR (validation failure, duplicate key in the file,
 *    an unresolved reference) is known BEFORE any write is attempted. These
 *    rows are simply skipped - the rest of the file still imports. This is
 *    "rejected," not "failed."
 *  - An unexpected failure while WRITING an otherwise-valid CREATE/UPDATE
 *    row (e.g. a genuine unique-constraint race between preview and
 *    confirm) is NOT something a per-row skip can safely paper over - it
 *    aborts and rolls back the entire import transaction (§8's "do not
 *    leave a partially corrupted import"), reported as a hard failure with
 *    nothing written, not a partial summary.
 */

export type ImportRowStatus = "CREATE" | "UPDATE" | "NO_CHANGE" | "ERROR";

export type ImportRowError = { code: string; message: string; field?: string };

export type ImportRowPlan = {
  /** 1-indexed spreadsheet row number (header = row 1), from csv-parser.ts. */
  row: number;
  status: ImportRowStatus;
  /** Human-readable business key value(s) for display, e.g. "code=CUST-001". */
  key: string;
  /** Existing row id once matched (UPDATE/NO_CHANGE), or set post-write for CREATE. */
  entityId?: string;
  /** Always empty unless status === "ERROR". */
  errors: ImportRowError[];
  /** Non-blocking notes shown in the preview/result (e.g. a cleared optional field). */
  warnings: string[];
  /** Which mapped columns actually differ, for UPDATE rows - preview display only. */
  changedFields?: string[];
};

export type ImportSummary = {
  batchId: string;
  importType: string;
  fileName: string;
  totalRows: number;
  created: number;
  updated: number;
  unchanged: number;
  rejected: number;
};

export type ImportPreviewResult = {
  summary: Omit<ImportSummary, "batchId" | "fileName">;
  rows: ImportRowPlan[];
  /** Rows the CSV parser itself couldn't align to the header row - never counted in `rows`. */
  malformedRows: { row: number; message: string }[];
};

export type ImportConfirmResult = {
  summary: ImportSummary;
  rows: ImportRowPlan[];
  malformedRows: { row: number; message: string }[];
  /** RFC4180 CSV ready for direct download - never persisted server-side. */
  resultCsv: string;
};

export const IMPORT_TYPES = [
  "categories",
  "units",
  "products",
  "product-units",
  "customers",
  "customer-addresses",
  "price-lists",
  "price-list-items",
] as const;

export type ImportType = (typeof IMPORT_TYPES)[number];
