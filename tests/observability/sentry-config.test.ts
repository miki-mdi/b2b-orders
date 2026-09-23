import { describe, expect, it } from "vitest";
import { DE_REGION_DSN_HOST_SUFFIX, isSentryConfigEnabled, isValidDeRegionDsn } from "@/lib/observability/sentry-config";

const VALID_DE_DSN = "https://examplekey@o123456.ingest.de.sentry.io/789";

describe("isValidDeRegionDsn", () => {
  it("accepts a valid HTTPS DE-region DSN", () => {
    expect(isValidDeRegionDsn(VALID_DE_DSN)).toBe(true);
  });

  it("rejects an HTTP DE-shaped DSN (protocol must be https)", () => {
    expect(isValidDeRegionDsn("http://examplekey@o123456.ingest.de.sentry.io/789")).toBe(false);
  });

  it("rejects an HTTPS non-DE DSN", () => {
    expect(isValidDeRegionDsn("https://examplekey@o123456.ingest.sentry.io/789")).toBe(false);
    expect(isValidDeRegionDsn("https://examplekey@o123456.ingest.us.sentry.io/789")).toBe(false);
  });

  it("rejects a malformed DSN", () => {
    expect(isValidDeRegionDsn("not-a-url")).toBe(false);
    expect(isValidDeRegionDsn("")).toBe(false);
  });

  it("rejects a missing DSN", () => {
    expect(isValidDeRegionDsn(undefined)).toBe(false);
  });

  it("compares hostname, not host - a DE host with an explicit port is still valid", () => {
    expect(isValidDeRegionDsn(`https://examplekey@o123456${DE_REGION_DSN_HOST_SUFFIX}:8443/789`)).toBe(true);
  });

  it("rejects a host that merely contains the suffix mid-string rather than ending with it", () => {
    expect(isValidDeRegionDsn("https://examplekey@o123456.ingest.de.sentry.io.evil.example/789")).toBe(false);
  });
});

describe("isSentryConfigEnabled", () => {
  it("requires both the enabled flag and a valid DE DSN", () => {
    expect(isSentryConfigEnabled("true", VALID_DE_DSN)).toBe(true);
    expect(isSentryConfigEnabled(undefined, VALID_DE_DSN)).toBe(false);
    expect(isSentryConfigEnabled("false", VALID_DE_DSN)).toBe(false);
    expect(isSentryConfigEnabled("true", undefined)).toBe(false);
    expect(isSentryConfigEnabled("true", "https://key@o1.ingest.sentry.io/1")).toBe(false);
  });

  it("is not satisfied by a truthy-looking but non-exact enabled value", () => {
    expect(isSentryConfigEnabled("TRUE", VALID_DE_DSN)).toBe(false);
    expect(isSentryConfigEnabled("1", VALID_DE_DSN)).toBe(false);
  });
});
