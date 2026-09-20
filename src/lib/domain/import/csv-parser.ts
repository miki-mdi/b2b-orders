/**
 * Minimal, dependency-free RFC4180-ish CSV parser (Phase 1F-A) - the read
 * side of what export/csv.ts's toCsv already is for writing. Treats every
 * uploaded file as untrusted input (§13): never throws on malformed
 * content, strips a UTF-8 BOM if present, and turns a structurally broken
 * row (wrong column count, an oversized cell) into a row-level error
 * instead of corrupting downstream parsing or crashing the request.
 *
 * "Row" numbers in the returned result are 1-indexed **spreadsheet** row
 * numbers (the header is row 1, the first data row is row 2), matching how
 * a seller reviewing errors against their own spreadsheet would count -
 * NOT a raw byte/line offset. Fully blank lines (no content at all) are
 * silently skipped and never counted as a row, same as every common CSV
 * tool's tolerance for stray blank lines.
 */

export const DEFAULT_MAX_CELL_LENGTH = 2000;

export type MalformedRow = { row: number; message: string };

export type ParsedCsv = {
  headers: string[];
  /** Well-formed data rows only, each aligned 1:1 with `headers`. */
  rows: string[][];
  /** 1-indexed spreadsheet row number of each row in `rows`, same order/length as `rows`. */
  rowNumbers: number[];
  malformedRows: MalformedRow[];
};

function isBlankRecord(record: string[]): boolean {
  return record.length === 1 && record[0] === "";
}

export function parseCsv(text: string, maxCellLength = DEFAULT_MAX_CELL_LENGTH): ParsedCsv {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  type RawRecord = { fields: string[]; oversized: boolean };
  const records: RawRecord[] = [];

  let field = "";
  let record: string[] = [];
  let oversized = false;
  let inQuotes = false;
  let i = 0;
  const n = s.length;

  const pushField = () => {
    if (field.length > maxCellLength) oversized = true;
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push({ fields: record, oversized });
    record = [];
    oversized = false;
  };

  while (i < n) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ",") {
      pushField();
      i += 1;
    } else if (ch === "\r") {
      if (s[i + 1] === "\n") i += 1;
      pushRecord();
      i += 1;
    } else if (ch === "\n") {
      pushRecord();
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  // Flush a trailing field/record that wasn't newline-terminated (a file
  // with no final trailing newline is common and must still parse).
  if (field.length > 0 || record.length > 0) {
    pushRecord();
  }

  const nonBlank = records.filter((r) => !isBlankRecord(r.fields));
  if (nonBlank.length === 0) {
    return { headers: [], rows: [], rowNumbers: [], malformedRows: [] };
  }

  const headers = nonBlank[0].fields;
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  const malformedRows: MalformedRow[] = [];

  for (let idx = 1; idx < nonBlank.length; idx++) {
    const { fields, oversized: rowOversized } = nonBlank[idx];
    const rowNumber = idx + 1; // header counted as spreadsheet row 1
    if (rowOversized) {
      malformedRows.push({ row: rowNumber, message: `A cell exceeds the maximum length of ${maxCellLength} characters` });
      continue;
    }
    if (fields.length !== headers.length) {
      malformedRows.push({
        row: rowNumber,
        message: `Expected ${headers.length} column(s), found ${fields.length}`,
      });
      continue;
    }
    rows.push(fields);
    rowNumbers.push(rowNumber);
  }

  return { headers, rows, rowNumbers, malformedRows };
}

/** headers -> column index, for O(1) lookup by CSV import's normalizeRow functions. Missing header -> -1 (distinguishes "column absent" from "column present but blank" - see upsert semantics in each <entity>-import.ts). */
export function headerIndex(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, idx) => {
    const key = h.trim();
    if (key && !map.has(key)) map.set(key, idx);
  });
  return map;
}

export function cell(row: string[], index: Map<string, number>, column: string): string | undefined {
  const idx = index.get(column);
  if (idx === undefined) return undefined; // column not present in this file at all
  return row[idx] ?? "";
}
