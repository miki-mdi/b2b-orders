import { describe, expect, it } from "vitest";
import { clampPage, clampPageSize, clampSearchTerm, MAX_PAGE_SIZE, MAX_SEARCH_TERM_LENGTH, toPageResult } from "@/lib/pagination";

describe("clampPage", () => {
  it("defaults to 1 for missing, zero, negative, or non-numeric input", () => {
    expect(clampPage(undefined)).toBe(1);
    expect(clampPage(0)).toBe(1);
    expect(clampPage(-5)).toBe(1);
    expect(clampPage("not-a-number")).toBe(1);
  });

  it("floors a fractional page and passes through a valid page", () => {
    expect(clampPage(3.9)).toBe(3);
    expect(clampPage("4")).toBe(4);
  });
});

describe("clampPageSize", () => {
  it("defaults when missing or invalid", () => {
    expect(clampPageSize(undefined, 20)).toBe(20);
    expect(clampPageSize(0, 20)).toBe(20);
    expect(clampPageSize(-1, 20)).toBe(20);
  });

  it("never exceeds MAX_PAGE_SIZE regardless of caller input - pilot safety limit", () => {
    expect(clampPageSize(999999)).toBe(MAX_PAGE_SIZE);
  });
});

describe("clampSearchTerm", () => {
  it("trims whitespace and treats an all-whitespace term as absent", () => {
    expect(clampSearchTerm("  hello  ")).toBe("hello");
    expect(clampSearchTerm("   ")).toBeUndefined();
    expect(clampSearchTerm(undefined)).toBeUndefined();
  });

  it("caps length at MAX_SEARCH_TERM_LENGTH", () => {
    const long = "x".repeat(500);
    expect(clampSearchTerm(long)?.length).toBe(MAX_SEARCH_TERM_LENGTH);
  });
});

describe("toPageResult", () => {
  it("computes totalPages, at least 1 even for zero total", () => {
    expect(toPageResult([], 0, 1, 20).totalPages).toBe(1);
    expect(toPageResult([1, 2, 3], 45, 1, 20).totalPages).toBe(3);
  });
});
