// Pure unit tests, no mocks, no database, no filesystem access.
import { describe, expect, it } from "vitest";
import { DemoCsvPreflightError, validateCsvHeaders } from "@/lib/bootstrap/demo-csv-import";
import { IMPORT_TEMPLATES } from "@/lib/domain/import/templates";
import { IMPORT_TYPES } from "@/lib/domain/import/types";

describe("validateCsvHeaders", () => {
  it.each(IMPORT_TYPES)("accepts the real template headers for %s", (importType) => {
    expect(() => validateCsvHeaders(importType, [...IMPORT_TEMPLATES[importType].headers], "test.csv")).not.toThrow();
  });

  it("throws when a column is missing", () => {
    const headers = IMPORT_TEMPLATES.categories.headers.slice(0, -1);
    expect(() => validateCsvHeaders("categories", headers, "categories.csv")).toThrow(DemoCsvPreflightError);
  });

  it("throws when a column is renamed", () => {
    const headers = [...IMPORT_TEMPLATES.categories.headers];
    headers[0] = "id";
    expect(() => validateCsvHeaders("categories", headers, "categories.csv")).toThrow(DemoCsvPreflightError);
  });

  it("throws when columns are reordered", () => {
    const headers = [...IMPORT_TEMPLATES.categories.headers].reverse();
    expect(() => validateCsvHeaders("categories", headers, "categories.csv")).toThrow(DemoCsvPreflightError);
  });

  it("throws when there is an extra column", () => {
    const headers = [...IMPORT_TEMPLATES.categories.headers, "extra"];
    expect(() => validateCsvHeaders("categories", headers, "categories.csv")).toThrow(DemoCsvPreflightError);
  });

  it("includes the file label and both header lists in the error message", () => {
    const headers = ["wrong"];
    expect(() => validateCsvHeaders("units", headers, "demo-data/local-only/acme/units.csv")).toThrow(
      /demo-data\/local-only\/acme\/units\.csv[\s\S]*expected:[\s\S]*found:/
    );
  });
});
