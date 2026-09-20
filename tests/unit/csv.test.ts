import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/domain/export/csv";

describe("toCsv", () => {
  it("produces a header row plus one row per data row, CRLF-terminated", () => {
    const csv = toCsv(["a", "b"], [
      [1, "x"],
      [2, "y"],
    ]);
    expect(csv).toBe("﻿a,b\r\n1,x\r\n2,y\r\n");
  });

  it("quotes a value containing a comma, quote, or newline, doubling embedded quotes", () => {
    const csv = toCsv(["name"], [["Smith, John"], ['He said "hi"'], ["line1\nline2"]]);
    expect(csv).toContain('"Smith, John"');
    expect(csv).toContain('"He said ""hi"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it("renders null/undefined as an empty cell, never the literal string", () => {
    const csv = toCsv(["a", "b"], [[null, undefined]]);
    expect(csv).toBe("﻿a,b\r\n,\r\n");
  });

  it("renders a Date as an ISO string", () => {
    const date = new Date("2026-01-15T10:00:00.000Z");
    const csv = toCsv(["date"], [[date]]);
    expect(csv).toContain("2026-01-15T10:00:00.000Z");
  });

  it("renders booleans as their string form", () => {
    const csv = toCsv(["active"], [[true], [false]]);
    expect(csv).toContain("true");
    expect(csv).toContain("false");
  });
});
