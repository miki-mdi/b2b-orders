/**
 * Pure, isomorphic Sentry enablement/DSN validation - no `process.env`
 * reads and no server-only imports (logger, etc). Safe to import from
 * instrumentation-client.ts and any "use client" component: every caller
 * decides which pair of env vars to pass in, so this file can never pull a
 * server-only value into the browser bundle.
 *
 * Sentry's DE-region SaaS ingestion hosts look like
 * `o<org-id>.ingest.de.sentry.io` - a DSN whose host doesn't end in that
 * suffix (including a same-shaped non-DE host) is treated as disabled
 * rather than silently sent to whichever region it happens to point at.
 */

export const DE_REGION_DSN_HOST_SUFFIX = ".ingest.de.sentry.io";

export function isValidDeRegionDsn(dsn: string | undefined): boolean {
  if (!dsn) return false;
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.hostname.endsWith(DE_REGION_DSN_HOST_SUFFIX);
}

export function isSentryConfigEnabled(enabledFlag: string | undefined, dsn: string | undefined): boolean {
  return enabledFlag === "true" && isValidDeRegionDsn(dsn);
}
