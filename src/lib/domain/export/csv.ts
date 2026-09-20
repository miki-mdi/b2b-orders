/**
 * Minimal, dependency-free CSV serialization (RFC 4180-ish). Shared by
 * every Phase 1E export so escaping/formatting rules live in exactly one
 * place rather than being re-implemented per export type.
 */

export type CsvCell = string | number | boolean | null | undefined | Date;

// Spreadsheet formula injection (Phase 1F-A, §13/§14): Excel/LibreOffice/
// Sheets treat a cell starting with =, +, -, @ (and Tab/CR, per the wider
// OWASP guidance) as a formula to evaluate on open, not literal text - a
// customer/product name someone typed as "-5% Bulk Discount" would
// otherwise become a live formula for whoever opens the export. Prefixing
// with a single quote forces spreadsheet apps to treat it as text while
// leaving the value itself unchanged (Excel/Sheets both strip a leading `'`
// from display). This was missing from every Phase 1E export - retrofitted
// here, in the one shared CSV-writing function, rather than per export.
const DANGEROUS_LEADING_CHARS = /^[=+\-@\t\r]/;

export function sanitizeForSpreadsheet(value: string): string {
  return DANGEROUS_LEADING_CHARS.test(value) ? `'${value}` : value;
}

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  const raw = cell instanceof Date ? cell.toISOString() : String(cell);
  const value = sanitizeForSpreadsheet(raw);
  // Quote whenever the value contains anything that would otherwise be
  // ambiguous in a comma-delimited, CRLF-terminated file.
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * `headers` become the first row verbatim (stable column names, per the
 * Phase 1E brief - never translated/localized, so a seller's saved
 * spreadsheet import mapping doesn't break if they change their UI locale).
 * A leading UTF-8 BOM is included so Excel (which otherwise guesses
 * Windows-1252 for a BOM-less file) renders non-ASCII characters -
 * Macedonian Cyrillic customer/product names in particular - correctly.
 */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(escapeCell).join(","), ...rows.map((row) => row.map(escapeCell).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
