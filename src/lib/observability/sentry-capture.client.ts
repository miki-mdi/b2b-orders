/**
 * Client-side (browser bundle) capture helper. Gated on the NEXT_PUBLIC_
 * pair only - independent of the server SENTRY_ENABLED/SENTRY_DSN vars,
 * which aren't readable from the browser anyway. No-ops entirely when
 * disabled: no console output, no network call, no side effect.
 */
import * as Sentry from "@sentry/nextjs";
import { isSentryConfigEnabled } from "@/lib/observability/sentry-config";

export function captureClientError(error: Error & { digest?: string }): void {
  if (!isSentryConfigEnabled(process.env.NEXT_PUBLIC_SENTRY_ENABLED, process.env.NEXT_PUBLIC_SENTRY_DSN)) {
    return;
  }
  Sentry.captureException(error);
}
