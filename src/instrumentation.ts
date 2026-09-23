/**
 * Server-side Sentry bootstrap (Node runtime only - see the NEXT_RUNTIME
 * guard in both exports below). Edge (src/proxy.ts) capture is explicitly
 * out of scope for this phase, per docs/SESSION_HANDOFF.md's observability
 * phase notes - onRequestError must not call into Sentry from the Edge
 * runtime here.
 *
 * Both SENTRY_ENABLED and a valid DE-region SENTRY_DSN are required before
 * Sentry.init ever runs - see src/lib/observability/sentry-config.ts. When
 * disabled, `register` returns without calling Sentry.init at all, so
 * there is no client for `onRequestError` to report through either.
 */
import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import { isSentryConfigEnabled, isValidDeRegionDsn } from "@/lib/observability/sentry-config";
import { createSentryBeforeSend, sentryBeforeBreadcrumb } from "@/lib/observability/sentry-scrub";
import { logger } from "@/lib/logging/logger";

// Explicit, allowlisted known-secret values to strip from any message/
// exception text - regex-shape redaction alone can't catch an opaque
// secret like AUTH_SECRET. Read only here (server-only file, never
// bundled to the browser) and passed into the pure scrub module rather
// than that module reading process.env itself.
function knownServerSecrets(): string[] {
  return [process.env.DATABASE_URL, process.env.MIGRATE_DATABASE_URL, process.env.AUTH_SECRET].filter(
    (value): value is string => Boolean(value),
  );
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const dsn = process.env.SENTRY_DSN;
  const enabledFlag = process.env.SENTRY_ENABLED;

  if (!isSentryConfigEnabled(enabledFlag, dsn)) {
    if (enabledFlag === "true" && dsn && !isValidDeRegionDsn(dsn)) {
      logger.warn("Sentry disabled: SENTRY_DSN host is not a valid DE-region host");
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: createSentryBeforeSend(knownServerSecrets()),
    beforeBreadcrumb: sentryBeforeBreadcrumb,
  });
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!isSentryConfigEnabled(process.env.SENTRY_ENABLED, process.env.SENTRY_DSN)) return;
  await Sentry.captureRequestError(...args);
};
