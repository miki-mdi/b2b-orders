import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
const captureRequestError = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  init,
  captureRequestError: (...args: unknown[]) => captureRequestError(...args),
}));

vi.mock("@/lib/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const VALID_DE_DSN = "https://examplekey@o123456.ingest.de.sentry.io/789";
const NON_DE_DSN = "https://examplekey@o123456.ingest.sentry.io/789";

function resetEnv() {
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
}

describe("src/instrumentation.ts (server, Node runtime)", () => {
  beforeEach(() => {
    init.mockClear();
    captureRequestError.mockClear();
    vi.resetModules();
    resetEnv();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("initializes when SENTRY_ENABLED=true and SENTRY_DSN is a valid DE DSN", async () => {
    vi.stubEnv("SENTRY_ENABLED", "true");
    vi.stubEnv("SENTRY_DSN", VALID_DE_DSN);
    const { register } = await import("@/instrumentation");
    await register();
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ dsn: VALID_DE_DSN, tracesSampleRate: 0, sendDefaultPii: false }));
  });

  it("does not initialize when SENTRY_DSN is set but SENTRY_ENABLED is not 'true'", async () => {
    vi.stubEnv("SENTRY_DSN", VALID_DE_DSN);
    const { register } = await import("@/instrumentation");
    await register();
    expect(init).not.toHaveBeenCalled();
  });

  it("does not initialize for a non-DE DSN even when enabled", async () => {
    vi.stubEnv("SENTRY_ENABLED", "true");
    vi.stubEnv("SENTRY_DSN", NON_DE_DSN);
    const { register } = await import("@/instrumentation");
    await register();
    expect(init).not.toHaveBeenCalled();
  });

  it("wires a beforeSend that strips configured synthetic secret literals from a message", async () => {
    // Deterministic, synthetic-only fixtures - never real .env.local values.
    // Production behavior (instrumentation.ts reading the real
    // DATABASE_URL/MIGRATE_DATABASE_URL/AUTH_SECRET at runtime and passing
    // them into createSentryBeforeSend) is unchanged; this test only proves
    // the wiring works, using values that carry no real credential.
    const syntheticDbUrl = "postgresql://synthetic_user:synthetic_password@localhost:5432/test_db";
    const syntheticMigrateDbUrl = "postgresql://synthetic_migrator:synthetic_password@localhost:5432/test_db";
    const syntheticAuthSecret = "synthetic-auth-secret-for-observability-test-only";

    vi.stubEnv("SENTRY_ENABLED", "true");
    vi.stubEnv("SENTRY_DSN", VALID_DE_DSN);
    vi.stubEnv("DATABASE_URL", syntheticDbUrl);
    vi.stubEnv("MIGRATE_DATABASE_URL", syntheticMigrateDbUrl);
    vi.stubEnv("AUTH_SECRET", syntheticAuthSecret);

    const { register } = await import("@/instrumentation");
    await register();

    const initOptions = init.mock.calls[0][0] as { beforeSend: (event: unknown, hint: unknown) => { message?: string } };
    const scrubbed = initOptions.beforeSend(
      { message: `DATABASE_URL=${syntheticDbUrl} MIGRATE_DATABASE_URL=${syntheticMigrateDbUrl} AUTH_SECRET=${syntheticAuthSecret}` },
      {},
    );
    expect(scrubbed.message).not.toContain(syntheticDbUrl);
    expect(scrubbed.message).not.toContain(syntheticMigrateDbUrl);
    expect(scrubbed.message).not.toContain(syntheticAuthSecret);
  });

  it("does not initialize on a non-Node runtime even when otherwise enabled", async () => {
    vi.stubEnv("SENTRY_ENABLED", "true");
    vi.stubEnv("SENTRY_DSN", VALID_DE_DSN);
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const { register } = await import("@/instrumentation");
    await register();
    expect(init).not.toHaveBeenCalled();
  });

  it("onRequestError does not call Sentry when disabled", async () => {
    const { onRequestError } = await import("@/instrumentation");
    await onRequestError(new Error("boom"), { path: "/x", method: "GET", headers: {} }, {
      routerKind: "App Router",
      routePath: "/x",
      routeType: "render",
      renderSource: "server-rendering",
      revalidateReason: undefined,
    });
    expect(captureRequestError).not.toHaveBeenCalled();
  });

  it("onRequestError calls Sentry.captureRequestError when enabled on the Node runtime", async () => {
    vi.stubEnv("SENTRY_ENABLED", "true");
    vi.stubEnv("SENTRY_DSN", VALID_DE_DSN);
    const { onRequestError } = await import("@/instrumentation");
    const err = new Error("boom");
    await onRequestError(err, { path: "/x", method: "GET", headers: {} }, {
      routerKind: "App Router",
      routePath: "/x",
      routeType: "render",
      renderSource: "server-rendering",
      revalidateReason: undefined,
    });
    expect(captureRequestError).toHaveBeenCalledTimes(1);
  });

  it("onRequestError does not call Sentry on a non-Node runtime even when enabled", async () => {
    vi.stubEnv("SENTRY_ENABLED", "true");
    vi.stubEnv("SENTRY_DSN", VALID_DE_DSN);
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const { onRequestError } = await import("@/instrumentation");
    await onRequestError(new Error("boom"), { path: "/x", method: "GET", headers: {} }, {
      routerKind: "App Router",
      routePath: "/x",
      routeType: "render",
      renderSource: "server-rendering",
      revalidateReason: undefined,
    });
    expect(captureRequestError).not.toHaveBeenCalled();
  });
});

describe("src/instrumentation-client.ts (browser bundle)", () => {
  beforeEach(() => {
    init.mockClear();
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("initializes on import when NEXT_PUBLIC_SENTRY_ENABLED=true and NEXT_PUBLIC_SENTRY_DSN is a valid DE DSN", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", VALID_DE_DSN);
    await import("@/instrumentation-client");
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: VALID_DE_DSN,
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        sendDefaultPii: false,
      }),
    );
  });

  it("does not initialize when NEXT_PUBLIC_SENTRY_DSN is set but NEXT_PUBLIC_SENTRY_ENABLED is not 'true'", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", VALID_DE_DSN);
    await import("@/instrumentation-client");
    expect(init).not.toHaveBeenCalled();
  });

  it("does not initialize when only the server-side pair is set", async () => {
    vi.stubEnv("SENTRY_ENABLED", "true");
    vi.stubEnv("SENTRY_DSN", VALID_DE_DSN);
    await import("@/instrumentation-client");
    expect(init).not.toHaveBeenCalled();
  });

  it("does not initialize for a non-DE DSN even when enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", NON_DE_DSN);
    await import("@/instrumentation-client");
    expect(init).not.toHaveBeenCalled();
  });
});
