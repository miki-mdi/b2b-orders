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
