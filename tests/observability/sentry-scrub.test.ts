import { describe, expect, it } from "vitest";
import type { ErrorEvent, EventHint } from "@sentry/nextjs";
import { createSentryBeforeSend, redact, sentryBeforeBreadcrumb, sentryBeforeSend, stripQueryString } from "@/lib/observability/sentry-scrub";

function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    message: "Something failed",
    ...overrides,
  } as ErrorEvent;
}

const HINT = {} as EventHint;

describe("sentryBeforeSend", () => {
  it("strips request headers, including Authorization/Cookie/User-Agent", () => {
    const event = makeEvent({
      request: {
        headers: {
          authorization: "Bearer secret-token",
          cookie: "session=abc123",
          "user-agent": "Mozilla/5.0",
        },
      },
    });
    const result = sentryBeforeSend(event, HINT);
    expect(result.request?.headers).toBeUndefined();
  });

  it("strips request body/data", () => {
    const event = makeEvent({ request: { data: { password: "hunter2" } } });
    const result = sentryBeforeSend(event, HINT);
    expect(result.request?.data).toBeUndefined();
  });

  it("strips request cookies", () => {
    const event = makeEvent({ request: { cookies: { session: "abc123" } } });
    const result = sentryBeforeSend(event, HINT);
    expect(result.request?.cookies).toBeUndefined();
  });

  it("strips event.user entirely", () => {
    const event = makeEvent({ user: { email: "buyer@customer.example", id: "u1", ip_address: "1.2.3.4" } });
    const result = sentryBeforeSend(event, HINT);
    expect(result.user).toBeUndefined();
  });

  it("strips the query string from request.url but keeps the path", () => {
    const event = makeEvent({ request: { url: "https://app.example.com/seller/orders?range=custom&from=2026-01-01" } });
    const result = sentryBeforeSend(event, HINT);
    expect(result.request?.url).toBe("https://app.example.com/seller/orders");
  });

  it("strips request.query_string if the SDK ever populates it separately", () => {
    const event = makeEvent({ request: { query_string: "range=custom&from=2026-01-01" } });
    const result = sentryBeforeSend(event, HINT);
    expect(result.request?.query_string).toBeUndefined();
  });

  it("strips a tenantId tag defensively, even though nothing sets one today", () => {
    const event = makeEvent({ tags: { tenantId: "tenant-123", release: "1.0.0" } });
    const result = sentryBeforeSend(event, HINT);
    expect(result.tags).not.toHaveProperty("tenantId");
    expect(result.tags?.release).toBe("1.0.0");
  });

  it("redacts an email-shaped substring in event.message", () => {
    const event = makeEvent({ message: "Failed to resolve customer buyer-two@alpha.test" });
    const result = sentryBeforeSend(event, HINT);
    expect(result.message).not.toContain("buyer-two@alpha.test");
    expect(result.message).toContain("[redacted]");
  });

  it("redacts a phone-shaped substring in an exception value", () => {
    const event = makeEvent({
      exception: { values: [{ type: "Error", value: "Contact +389 70 123 456 failed to resolve" }] },
    });
    const result = sentryBeforeSend(event, HINT);
    expect(result.exception?.values?.[0].value).not.toContain("70 123 456");
    expect(result.exception?.values?.[0].value).toContain("[redacted]");
  });

  it("redacts a DATABASE_URL-shaped connection string in a message", () => {
    const dbUrl = "postgresql://synthetic_user:synthetic_password@localhost:5432/test_db";
    const event = makeEvent({ message: `Connection failed: ${dbUrl}` });
    const result = sentryBeforeSend(event, HINT);
    expect(result.message).not.toContain(dbUrl);
    expect(result.message).not.toContain("synthetic_password");
  });

  it("the base sentryBeforeSend (no known-secrets list) cannot catch an opaque secret like AUTH_SECRET - documents why createSentryBeforeSend exists", () => {
    // Deterministic, synthetic fixture only - never a real secret value.
    const opaqueSecret = "synthetic-auth-secret-for-observability-test-only";
    const event = makeEvent({ message: `env dump AUTH_SECRET=${opaqueSecret}` });
    const result = sentryBeforeSend(event, HINT);
    expect(result.message).toContain(opaqueSecret);
  });

  it("createSentryBeforeSend strips explicit known-secret literals (e.g. real DATABASE_URL/AUTH_SECRET values) from a message", () => {
    // Deterministic, synthetic fixtures only - never real .env.local values.
    const dbUrl = "postgresql://synthetic_user:synthetic_password@localhost:5432/test_db";
    const authSecret = "synthetic-auth-secret-for-observability-test-only";
    const beforeSendWithSecrets = createSentryBeforeSend([dbUrl, authSecret]);
    const event = makeEvent({ message: `env dump DATABASE_URL=${dbUrl} AUTH_SECRET=${authSecret}` });
    const result = beforeSendWithSecrets(event, HINT);
    expect(result.message).not.toContain(dbUrl);
    expect(result.message).not.toContain(authSecret);
    expect(result.message).toContain("[redacted]");
  });

  it("createSentryBeforeSend strips known-secret literals from an exception value too", () => {
    const authSecret = "synthetic-auth-secret-for-observability-test-only";
    const beforeSendWithSecrets = createSentryBeforeSend([authSecret]);
    const event = makeEvent({ exception: { values: [{ type: "Error", value: `bad token ${authSecret}` }] } });
    const result = beforeSendWithSecrets(event, HINT);
    expect(result.exception?.values?.[0].value).not.toContain(authSecret);
  });

  it("empties a populated breadcrumbs array", () => {
    const event = makeEvent({
      breadcrumbs: [{ category: "fetch", data: { url: "https://app.example.com/api/x?token=abc" } }],
    });
    const result = sentryBeforeSend(event, HINT);
    expect(result.breadcrumbs).toBeUndefined();
  });
});

describe("sentryBeforeBreadcrumb", () => {
  it("always returns null - no SDK-auto breadcrumbs are kept in this phase", () => {
    expect(sentryBeforeBreadcrumb()).toBeNull();
  });
});

describe("stripQueryString", () => {
  it("removes everything from the first '?' onward", () => {
    expect(stripQueryString("https://x.example/a/b?c=1&d=2")).toBe("https://x.example/a/b");
  });

  it("returns the URL unchanged when there is no query string", () => {
    expect(stripQueryString("https://x.example/a/b")).toBe("https://x.example/a/b");
  });
});

describe("redact", () => {
  it("leaves ordinary text untouched", () => {
    expect(redact("Order #42 could not be confirmed")).toBe("Order #42 could not be confirmed");
  });
});
