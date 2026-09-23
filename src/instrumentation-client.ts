/**
 * Client-side (browser bundle) Sentry bootstrap. Uses this Next.js
 * version's instrumentation-client.ts convention, not the older
 * sentry.client.config.ts pattern.
 *
 * No logger import here by design - this module must stay pure/browser-safe
 * and must never depend on anything server-only (see
 * src/lib/observability/sentry-config.ts's own header comment). When
 * disabled, this file does nothing at all: no console output, no network
 * call, no side effect.
 *
 * Gated on the NEXT_PUBLIC_ pair only - independent of the server
 * SENTRY_ENABLED/SENTRY_DSN vars, which this bundle can't read anyway.
 */
import * as Sentry from "@sentry/nextjs";
import { isSentryConfigEnabled } from "@/lib/observability/sentry-config";
import { sentryBeforeBreadcrumb, sentryBeforeSend } from "@/lib/observability/sentry-scrub";

if (isSentryConfigEnabled(process.env.NEXT_PUBLIC_SENTRY_ENABLED, process.env.NEXT_PUBLIC_SENTRY_DSN)) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend: sentryBeforeSend,
    beforeBreadcrumb: sentryBeforeBreadcrumb,
  });
}
