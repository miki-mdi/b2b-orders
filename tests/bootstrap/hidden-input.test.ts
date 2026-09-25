import { afterEach, describe, expect, it } from "vitest";
import { isInteractiveTTY, readHiddenLine, readVisibleLine } from "@/lib/bootstrap/hidden-input";

const originalIsTTY = process.stdin.isTTY;

function setStdinTTY(value: boolean | undefined) {
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
}

describe("hidden-input TTY refusal", () => {
  afterEach(() => {
    setStdinTTY(originalIsTTY);
  });

  it("isInteractiveTTY reflects process.stdin.isTTY", () => {
    setStdinTTY(true);
    expect(isInteractiveTTY()).toBe(true);
    setStdinTTY(false);
    expect(isInteractiveTTY()).toBe(false);
    setStdinTTY(undefined);
    expect(isInteractiveTTY()).toBe(false);
  });

  it("readHiddenLine rejects immediately when stdin is not a TTY, without touching stdin", async () => {
    setStdinTTY(false);
    await expect(readHiddenLine("password: ")).rejects.toThrow(/interactive terminal/i);
  });

  it("readHiddenLine rejects when stdin.isTTY is undefined (CI/piped input)", async () => {
    setStdinTTY(undefined);
    await expect(readHiddenLine("password: ")).rejects.toThrow(/interactive terminal/i);
  });

  it("readVisibleLine rejects immediately when stdin is not a TTY", async () => {
    setStdinTTY(false);
    await expect(readVisibleLine("name: ")).rejects.toThrow(/interactive terminal/i);
  });
});
