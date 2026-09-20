import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/domain/import/csv-parser";

describe("parseCsv", () => {
  it("parses a simple comma-separated file", () => {
    const result = parseCsv("code,name\nA,Alpha\nB,Beta\n");
    expect(result.headers).toEqual(["code", "name"]);
    expect(result.rows).toEqual([
      ["A", "Alpha"],
      ["B", "Beta"],
    ]);
    expect(result.rowNumbers).toEqual([2, 3]);
    expect(result.malformedRows).toEqual([]);
  });

  it("handles a file with no trailing newline", () => {
    const result = parseCsv("code,name\nA,Alpha");
    expect(result.rows).toEqual([["A", "Alpha"]]);
  });

  it("strips a leading UTF-8 BOM", () => {
    const result = parseCsv("﻿code,name\nA,Alpha\n");
    expect(result.headers).toEqual(["code", "name"]);
  });

  it("supports quoted fields with embedded commas", () => {
    const result = parseCsv('code,name\nA,"Alpha, Inc."\n');
    expect(result.rows[0]).toEqual(["A", "Alpha, Inc."]);
  });

  it("supports escaped double quotes inside a quoted field", () => {
    const result = parseCsv('code,name\nA,"Say ""hello"""\n');
    expect(result.rows[0]).toEqual(["A", 'Say "hello"']);
  });

  it("supports embedded newlines inside a quoted field", () => {
    const result = parseCsv('code,notes\nA,"line one\nline two"\nB,plain\n');
    expect(result.rows[0]).toEqual(["A", "line one\nline two"]);
    expect(result.rows[1]).toEqual(["B", "plain"]);
    // The embedded newline inside quotes must not be counted as its own row.
    expect(result.rowNumbers).toEqual([2, 3]);
  });

  it("handles CRLF line endings", () => {
    const result = parseCsv("code,name\r\nA,Alpha\r\nB,Beta\r\n");
    expect(result.rows).toEqual([
      ["A", "Alpha"],
      ["B", "Beta"],
    ]);
  });

  it("supports Macedonian (Cyrillic) UTF-8 text in cells", () => {
    const result = parseCsv("code,nameMk\nBEV,Пијалоци\n");
    expect(result.rows[0]).toEqual(["BEV", "Пијалоци"]);
  });

  it("preserves a blank optional field", () => {
    const result = parseCsv("code,description\nA,\n");
    expect(result.rows[0]).toEqual(["A", ""]);
  });

  it("skips fully blank lines without treating them as rows", () => {
    const result = parseCsv("code,name\nA,Alpha\n\nB,Beta\n");
    expect(result.rows).toEqual([
      ["A", "Alpha"],
      ["B", "Beta"],
    ]);
  });

  it("reports a malformed row when the column count doesn't match the header", () => {
    const result = parseCsv("code,name\nA,Alpha,extra\nB,Beta\n");
    expect(result.rows).toEqual([["B", "Beta"]]);
    expect(result.malformedRows).toEqual([{ row: 2, message: "Expected 2 column(s), found 3" }]);
  });

  it("never throws on malformed input, including an unterminated quote", () => {
    expect(() => parseCsv('code,name\nA,"unterminated')).not.toThrow();
  });

  it("flags an oversized cell as malformed instead of accepting it", () => {
    const hugeCell = "x".repeat(50);
    const result = parseCsv(`code,name\nA,${hugeCell}\n`, 10);
    expect(result.rows).toEqual([]);
    expect(result.malformedRows).toEqual([{ row: 2, message: "A cell exceeds the maximum length of 10 characters" }]);
  });

  it("returns empty results for an empty file", () => {
    const result = parseCsv("");
    expect(result).toEqual({ headers: [], rows: [], rowNumbers: [], malformedRows: [] });
  });
});
