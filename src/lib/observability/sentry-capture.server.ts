/**
 * Server-only capture helper. Gated on the server SENTRY_ENABLED/SENTRY_DSN
 * pair only. Used for the one known swallowed exception this phase
 * explicitly forwards (order-events.ts's listener-failure path, per
 * docs/SESSION_HANDOFF.md §13) - not a general-purpose "log and report"
 * wrapper. No-ops entirely when disabled.
 */
import * as Sentry from "@sentry/nextjs";
import { isSentryConfigEnabled } from "@/lib/observability/sentry-config";

export function captureServerException(error: unknown, extra?: Record<string, string>): void {
  if (!isSentryConfigEnabled(process.env.SENTRY_ENABLED, process.env.SENTRY_DSN)) {
    return;
  }
  Sentry.captureException(error, extra ? { tags: extra } : undefined);
}
