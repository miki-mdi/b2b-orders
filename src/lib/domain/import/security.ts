/**
 * Pilot-scale import limits (Phase 1F-A, §9) - sized for real SME/wholesale
 * onboarding (a few thousand SKUs/customers in one file), not a tiny demo
 * cap, while still bounding memory/transaction size per request. Every
 * uploaded file is untrusted input (§13): size is checked on the raw byte
 * count BEFORE anything is parsed, so an oversized upload never reaches the
 * parser at all.
 */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 5_000; // data rows, header excluded
export { DEFAULT_MAX_CELL_LENGTH as MAX_CELL_LENGTH } from "./csv-parser";

/**
 * Explicit withTenantContext transaction timeouts for preview/confirm
 * (src/lib/domain/import/import-service.ts), discovered as a real
 * production robustness gap during Phase 1F-B2 closure: both previewImport
 * and confirmImport run the ENTIRE file (up to MAX_IMPORT_ROWS rows) inside
 * one interactive transaction, and Prisma's client-wide default transaction
 * timeout is only 5000ms - a confirmed 1,000-row ProductUnit import (2 FK
 * lookups/row, the slowest of the 8 import types) already measures close to
 * or over that on ordinary hardware, and the supported 5,000-row cap
 * projects to roughly 25-28s of real work. Left at the 5s default, a
 * supported-size import would routinely fail with a "transaction expired"
 * error, not a bug in the import logic itself.
 *
 * Sized from that same projection, with margin:
 *  - preview does no writes (~1.5s measured per 1,000 rows -> ~7.5s
 *    projected at the 5,000-row cap) - 20s leaves generous headroom.
 *  - confirm does the same per-row reads plus writes and an audit log entry
 *    per row (~25-28s projected at the cap) - 60s leaves real operational
 *    margin without approaching Prisma's own default maxWait/statement
 *    behavior for anything else in the app.
 *
 * Deliberately NOT a change to Prisma's client-wide transaction defaults
 * (src/lib/db/prisma.ts) or to withTenantContext's behavior for any other
 * caller - see that function's own comment. maxWait is left at Prisma's
 * default (2000ms): the failure this fixes is entirely about `timeout`
 * (how long an already-started transaction may run), not `maxWait` (how
 * long the client waits to acquire one before starting) - there is no
 * evidence of connection-acquisition delay here.
 */
export const IMPORT_PREVIEW_TRANSACTION_TIMEOUT_MS = 20_000;
export const IMPORT_CONFIRM_TRANSACTION_TIMEOUT_MS = 60_000;

export class ImportFileTooLargeError extends Error {}
export class ImportTooManyRowsError extends Error {}

export function assertFileSize(byteLength: number): void {
  if (byteLength > MAX_FILE_SIZE_BYTES) {
    throw new ImportFileTooLargeError(
      `File is too large (${(byteLength / (1024 * 1024)).toFixed(1)} MB). Maximum is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`
    );
  }
}

export function assertRowCount(rowCount: number): void {
  if (rowCount > MAX_IMPORT_ROWS) {
    throw new ImportTooManyRowsError(`File has ${rowCount} data rows. Maximum is ${MAX_IMPORT_ROWS} per import.`);
  }
}

// Re-exported from the export module, which is this codebase's single
// source of truth for CSV-writing rules (see export/csv.ts's own header
// comment) - the import result CSV must neutralize spreadsheet-formula
// injection exactly the same way every export already does.
export { sanitizeForSpreadsheet } from "@/lib/domain/export/csv";
