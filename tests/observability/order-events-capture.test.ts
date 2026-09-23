import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

vi.mock("@/lib/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const VALID_DE_DSN = "https://examplekey@o123456.ingest.de.sentry.io/789";

describe("order-events.ts swallowed listener failure -> Sentry capture", () => {
  beforeEach(() => {
    captureException.mockClear();
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const baseEvent = {
    type: "SUBMITTED" as const,
    tenantId: "tenant-1",
    orderId: "order-1",
    orderNumber: 1,
    customerId: "customer-1",
    actorUserId: null,
    occurredAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  it("does not call Sentry.captureException for a swallowed listener error when disabled", async () => {
    const { onOrderEvent, publishOrderEvent } = await import("@/lib/domain/orders/order-events");
    const unsubscribe = onOrderEvent(() => {
      throw new Error("listener boom");
    });
    await publishOrderEvent(baseEvent);
    unsubscribe();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("calls Sentry.captureException exactly once for a swallowed listener error when enabled", async () => {
    vi.stubEnv("SENTRY_ENABLED", "true");
    vi.stubEnv("SENTRY_DSN", VALID_DE_DSN);
    const { onOrderEvent, publishOrderEvent } = await import("@/lib/domain/orders/order-events");
    const unsubscribe = onOrderEvent(() => {
      throw new Error("listener boom");
    });
    await publishOrderEvent(baseEvent);
    unsubscribe();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { source: "order-events-listener" } });
  });

  it("does not report anything when no listener throws", async () => {
    vi.stubEnv("SENTRY_ENABLED", "true");
    vi.stubEnv("SENTRY_DSN", VALID_DE_DSN);
    const { publishOrderEvent } = await import("@/lib/domain/orders/order-events");
    await publishOrderEvent(baseEvent);
    expect(captureException).not.toHaveBeenCalled();
  });
});
