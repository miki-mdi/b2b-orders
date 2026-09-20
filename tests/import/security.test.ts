import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/domain/export/csv";
import { sanitizeForSpreadsheet, MAX_FILE_SIZE_BYTES, MAX_IMPORT_ROWS, assertFileSize, assertRowCount, ImportFileTooLargeError, ImportTooManyRowsError } from "@/lib/domain/import/security";

describe("sanitizeForSpreadsheet (shared by every export and the import result CSV)", () => {
  it.each(["=cmd", "+1+1", "-1+1", "@SUM(A1)", "\t=evil", "\revil"])(
    "prefixes a cell starting with a dangerous character (%s) with a single quote",
    (dangerous) => {
      expect(sanitizeForSpreadsheet(dangerous)).toBe(`'${dangerous}`);
    }
  );

  it("leaves an ordinary cell untouched", () => {
    expect(sanitizeForSpreadsheet("Alpha Widget")).toBe("Alpha Widget");
    expect(sanitizeForSpreadsheet("")).toBe("");
  });

  it("is applied inside toCsv, neutralizing formula injection in every export", () => {
    const csv = toCsv(["name"], [["=HYPERLINK(\"http://evil\")"]]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/(?<!')=HYPERLINK/);
  });
});

describe("import size limits", () => {
  it("accepts a file at or under the limit", () => {
    expect(() => assertFileSize(MAX_FILE_SIZE_BYTES)).not.toThrow();
  });

  it("rejects a file over the limit", () => {
    expect(() => assertFileSize(MAX_FILE_SIZE_BYTES + 1)).toThrow(ImportFileTooLargeError);
  });

  it("accepts a row count at or under the limit", () => {
    expect(() => assertRowCount(MAX_IMPORT_ROWS)).not.toThrow();
  });

  it("rejects a row count over the limit", () => {
    expect(() => assertRowCount(MAX_IMPORT_ROWS + 1)).toThrow(ImportTooManyRowsError);
  });
});
