/**
 * Minimal, dependency-free CSV serialization (RFC 4180-ish). Shared by
 * every Phase 1E export so escaping/formatting rules live in exactly one
 * place rather than being re-implemented per export type.
 */

export type CsvCell = string | number | boolean | null | undefined | Date;

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  const value = cell instanceof Date ? cell.toISOString() : String(cell);
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
