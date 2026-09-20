import type { ImportRowError } from "./types";

/** A column entirely absent from the header returns undefined; present-but-blank returns "". This distinction is what lets each entity's diff() tell "leave untouched" apart from "clear it" (requirement #5). */
export function readCell(row: string[], index: Map<string, number>, column: string): string | undefined {
  const idx = index.get(column);
  if (idx === undefined) return undefined;
  return (row[idx] ?? "").trim();
}

export function isColumnPresent(index: Map<string, number>, column: string): boolean {
  return index.has(column);
}

const TRUE_TOKENS = new Set(["true", "1", "yes", "y"]);
const FALSE_TOKENS = new Set(["false", "0", "no", "n"]);

/** Absent/blank -> `fallback` (the entity's normal default). An unrecognized token is a row error, not a silent guess. */
export function parseBooleanCell(raw: string | undefined, fallback: boolean, field: string, errors: ImportRowError[]): boolean {
  if (!raw) return fallback;
  const v = raw.toLowerCase();
  if (TRUE_TOKENS.has(v)) return true;
  if (FALSE_TOKENS.has(v)) return false;
  errors.push({ field, code: "INVALID_BOOLEAN", message: `"${raw}" is not a valid true/false value for ${field}.` });
  return fallback;
}

/** Absent/blank -> undefined (caller decides the default). A non-numeric cell is a row error. */
export function parseOptionalNumberCell(raw: string | undefined, field: string, errors: ImportRowError[]): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    errors.push({ field, code: "INVALID_NUMBER", message: `"${raw}" is not a valid number for ${field}.` });
    return undefined;
  }
  return n;
}

export function requireCell(raw: string | undefined, field: string, errors: ImportRowError[]): string {
  if (!raw) {
    errors.push({ field, code: "REQUIRED_FIELD", message: `${field} is required.` });
    return "";
  }
  return raw;
}

/** Turns a zod safeParse failure into ImportRowError entries, field-named from the issue path. */
export function pushZodErrors(errors: ImportRowError[], zodError: { issues: { path: PropertyKey[]; message: string }[] }): void {
  for (const issue of zodError.issues) {
    errors.push({ field: typeof issue.path[0] === "string" ? issue.path[0] : undefined, code: "VALIDATION_ERROR", message: issue.message });
  }
}
