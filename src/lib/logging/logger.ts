/**
 * Minimal structured logging abstraction. Phase 1E's brief is explicit:
 * "do not add an external observability vendor yet" - this exists purely so
 * every call site logs through one shape (level, message, structured
 * metadata) instead of ad-hoc `console.log`/`console.error` calls with
 * hand-formatted strings (see the previous version of
 * src/lib/domain/orders/order-events.ts). Swapping the `write` function
 * for a real provider (Datadog, Sentry, CloudWatch, ...) later is a
 * one-file change - nothing else in the codebase needs to know.
 *
 * Never pass a password, token, connection string, or other secret as
 * metadata - this module does no redaction of its own, it trusts callers
 * the same way the rest of the codebase trusts `writeAuditLogEntry` callers
 * not to hand it something that shouldn't be persisted.
 */

export type LogLevel = "info" | "warn" | "error";

export type LogMetadata = {
  tenantId?: string;
  customerId?: string;
  userId?: string;
  orderId?: string;
  requestId?: string;
  [key: string]: unknown;
};

type LogEntry = {
  level: LogLevel;
  message: string;
  timestamp: string;
} & LogMetadata;

function write(level: LogLevel, message: string, metadata?: LogMetadata): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...metadata,
  };

  // JSON lines are both human-scannable in a local dev terminal and
  // directly parseable by any future log aggregator - no format change
  // needed when a real provider is introduced.
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, metadata?: LogMetadata) => write("info", message, metadata),
  warn: (message: string, metadata?: LogMetadata) => write("warn", message, metadata),
  error: (message: string, metadata?: LogMetadata) => write("error", message, metadata),
};
