import { describe, expect, it } from "vitest";
import { validatePassword, passwordsMatch } from "@/lib/bootstrap/password-policy";

describe("bootstrap password policy", () => {
  it("rejects an empty password", () => {
    expect(validatePassword("")).toEqual({ ok: false, reason: expect.stringContaining("empty") });
  });

  it("rejects a too-short password", () => {
    const result = validatePassword("short1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("12 characters");
  });

  it("accepts a password at exactly the minimum length", () => {
    expect(validatePassword("a".repeat(12))).toEqual({ ok: true });
  });

  it("accepts a longer password", () => {
    expect(validatePassword("a much longer sentence-like password")).toEqual({ ok: true });
  });
});

describe("bootstrap password confirmation match", () => {
  it("matches identical passwords", () => {
    expect(passwordsMatch("correct-horse-battery", "correct-horse-battery")).toBe(true);
  });

  it("rejects a mismatch", () => {
    expect(passwordsMatch("correct-horse-battery", "correct-horse-staple")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(passwordsMatch("Password123456", "password123456")).toBe(false);
  });
});
