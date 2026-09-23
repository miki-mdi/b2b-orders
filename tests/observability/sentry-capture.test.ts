import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

const VALID_DE_DSN = "https://examplekey@o123456.ingest.de.sentry.io/789";

describe("captureClientError", () => {
  beforeEach(() => {
    captureException.mockClear();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not call Sentry.captureException when disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", VALID_DE_DSN);
    const { captureClientError } = await import("@/lib/observability/sentry-capture.client");
    captureClientError(new Error("boom"));
    expect(captureException).not.toHaveBeenCalled();
  });

  it("calls Sentry.captureException exactly once when enabled with a valid DE DSN", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", VALID_DE_DSN);
    const { captureClientError } = await import("@/lib/observability/sentry-capture.client");
    const error = new Error("boom");
    captureClientError(error);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it("does not call Sentry.captureException when only the server pair is set", async () => {
    vi.stubEnv("SENTRY_ENABLED", "true");
    vi.stubEnv("SENTRY_DSN", VALID_DE_DSN);
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const { captureClientError } = await import("@/lib/observability/sentry-capture.client");
    captureClientError(new Error("boom"));
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe("captureServerException", () => {
  beforeEach(() => {
    captureException.mockClear();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not call Sentry.captureException when disabled", async () => {
    vi.stubEnv("SENTRY_ENABLED", "false");
    vi.stubEnv("SENTRY_DSN", VALID_DE_DSN);
    const { captureServerException } = await import("@/lib/observability/sentry-capture.server");
    captureServerException(new Error("boom"));
    expect(captureException).not.toHaveBeenCalled();
  });

  it("calls Sentry.captureException exactly once when enabled with a valid DE DSN", async () => {
    vi.stubEnv("SENTRY_ENABLED", "true");
    vi.stubEnv("SENTRY_DSN", VALID_DE_DSN);
    const { captureServerException } = await import("@/lib/observability/sentry-capture.server");
    const error = new Error("boom");
    captureServerException(error, { source: "order-events-listener" });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error, { tags: { source: "order-events-listener" } });
  });
});
