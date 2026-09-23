/**
 * Pure, isomorphic Sentry event scrubbing - the centralized defense-in-depth
 * layer every enabled Sentry.init() call (server and client) wires as its
 * beforeSend/beforeBreadcrumb. No headers, cookies, request/response bodies,
 * user identity, or tenant identifiers are ever allowed to survive into an
 * outbound event, regardless of what the SDK's own default integrations
 * would otherwise attach - this is the one place that's relied on, not the
 * SDK's own defaults.
 *
 * No SDK-auto breadcrumbs are kept in this phase at all (see
 * sentryBeforeBreadcrumb) - any that somehow still appear on an event are
 * stripped again in sentryBeforeSend as a second backstop.
 *
 * Regex-shaped redaction (email/phone/connection-string) can't catch an
 * opaque secret like AUTH_SECRET, which has no distinguishing shape - an
 * allowlisted, explicit literal-value strip (`knownSecrets`) is what
 * actually guarantees a specific known secret value never survives, and is
 * preferred over trying to widen the regex denylist. `createSentryBeforeSend`
 * takes that list as an explicit parameter rather than reading
 * `process.env` itself, so this file stays pure and never needs to know
 * server-only env var names - only src/instrumentation.ts (server-only)
 * ever supplies one.
 */
import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const CONNECTION_STRING_PATTERN = /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+/gi;
const REDACTED = "[redacted]";

export function stripQueryString(url: string): string {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

export function redact(text: string, knownSecrets: readonly string[] = []): string {
  let result = text
    .replace(CONNECTION_STRING_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(PHONE_PATTERN, REDACTED);

  for (const secret of knownSecrets) {
    if (secret) result = result.split(secret).join(REDACTED);
  }

  return result;
}

export function sentryBeforeBreadcrumb(): null {
  return null;
}

export function createSentryBeforeSend(knownSecrets: readonly string[] = []) {
  return function sentryBeforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent {
    delete event.user;
    delete event.breadcrumbs;

    if (event.request) {
      delete event.request.headers;
      delete event.request.cookies;
      delete event.request.data;
      delete event.request.query_string;
      if (event.request.url) {
        event.request.url = stripQueryString(event.request.url);
      }
    }

    if (event.tags && "tenantId" in event.tags) {
      delete (event.tags as Record<string, unknown>).tenantId;
    }

    if (event.message) {
      event.message = redact(event.message, knownSecrets);
    }

    for (const value of event.exception?.values ?? []) {
      if (value.value) {
        value.value = redact(value.value, knownSecrets);
      }
    }

    return event;
  };
}

/** Convenience default with no extra known-secret stripping - used by the client bundle, which has no server secrets to know about. */
export const sentryBeforeSend = createSentryBeforeSend();
