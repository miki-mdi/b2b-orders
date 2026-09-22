/**
 * Pure, DB-free date-range resolution for the seller dashboard's "Submitted
 * order value" / "Top products" analytics (Phase 1F-B2). Every boundary is
 * computed against a single, fixed, application-wide business timezone
 * rather than the ambient server-process timezone - an explicit MVP
 * convention (single-region pilot, matching Tenant's own existing
 * defaultCurrency "MKD" / locale "mk" defaults - prisma/schema.prisma), not
 * an accidental one. If this product ever goes multi-region, this constant
 * is the one place a per-tenant timezone would need to be threaded in -
 * nothing about the analytics queries themselves (src/lib/domain/dashboard/
 * sales-analytics-service.ts) would need to change.
 *
 * All ranges are [from, to) - inclusive start, exclusive end - to avoid the
 * classic end-of-day 23:59:59.999 fencepost/timezone bugs. A custom range's
 * "to" date is an inclusive calendar day from the caller's point of view,
 * implemented internally as the exclusive upper bound of the *next* day's
 * start.
 */

export const DASHBOARD_TIMEZONE = "Europe/Skopje";
export const MAX_CUSTOM_RANGE_DAYS = 366;

export type DashboardDateRangeOption = "today" | "week" | "month" | "custom";

export type DashboardDateRange = {
  option: DashboardDateRangeOption;
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
};

export type DashboardDateRangeInput = {
  range?: string;
  /** YYYY-MM-DD, only read when range === "custom". */
  from?: string;
  /** YYYY-MM-DD, inclusive calendar day, only read when range === "custom". */
  to?: string;
};

export type DashboardDateRangeFailureReason =
  | "INVALID_RANGE_OPTION"
  | "MISSING_CUSTOM_DATES"
  | "INVALID_CUSTOM_DATE"
  | "CUSTOM_RANGE_INVERTED"
  | "CUSTOM_RANGE_TOO_LONG";

export type DashboardDateRangeResult =
  | { ok: true; value: DashboardDateRange }
  | { ok: false; reason: DashboardDateRangeFailureReason; fallback: DashboardDateRange };

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CalendarDate = { year: number; month: number; day: number };

/**
 * The wall-clock offset (business-timezone-minus-UTC, in ms) at `instant`.
 * A single correction pass against a UTC-midnight guess is exact for
 * resolving a midnight boundary in Europe/Skopje specifically: EU DST
 * transitions land at 03:00/04:00 local time, never at 00:00, so a
 * start-of-day instant is never inside the "spring forward" gap or "fall
 * back" fold that would make a naive single-pass conversion ambiguous.
 */
function businessTimezoneOffsetMs(instant: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant.getTime();
}

/** The Y/M/D calendar date `instant` falls on when viewed in the business timezone. */
function partsInBusinessTimezone(instant: Date): CalendarDate {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DASHBOARD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** The UTC instant corresponding to 00:00 business-timezone wall-clock time on the given calendar date. `day` may be out of a month's normal range (e.g. 0 or 32) - JS's Date.UTC normalization handles month/year rollover correctly. */
function startOfBusinessDay(date: CalendarDate): Date {
  const utcGuess = new Date(Date.UTC(date.year, date.month - 1, date.day, 0, 0, 0));
  const offsetMs = businessTimezoneOffsetMs(utcGuess);
  return new Date(utcGuess.getTime() - offsetMs);
}

function dayRange(date: CalendarDate): { from: Date; to: Date } {
  return { from: startOfBusinessDay(date), to: startOfBusinessDay({ ...date, day: date.day + 1 }) };
}

/** The Monday on or before `date`, per the approved Monday-start-of-week convention. */
function mondayOnOrBefore(date: CalendarDate): CalendarDate {
  const calendarDate = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const isoWeekday = calendarDate.getUTCDay() === 0 ? 7 : calendarDate.getUTCDay(); // 1=Mon..7=Sun
  const mondayUtc = new Date(Date.UTC(date.year, date.month - 1, date.day - (isoWeekday - 1)));
  return { year: mondayUtc.getUTCFullYear(), month: mondayUtc.getUTCMonth() + 1, day: mondayUtc.getUTCDate() };
}

/** Parses a strict YYYY-MM-DD string, rejecting anything that doesn't round-trip (e.g. "2026-02-30", which Date.UTC would otherwise silently normalize into March). */
function parseDateOnly(value: string): CalendarDate | null {
  if (!DATE_ONLY_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

function calendarDateSerial(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

/**
 * Resolves a dashboard date-range request to concrete UTC instants, never
 * throwing - an invalid/missing option or custom range comes back as
 * `{ ok: false, reason, fallback }` with `fallback` always set to "today",
 * so a caller can degrade safely (e.g. redirect to the default range with a
 * message) rather than ever erroring the whole page.
 */
export function resolveDashboardDateRange(input: DashboardDateRangeInput, now: Date = new Date()): DashboardDateRangeResult {
  const today = partsInBusinessTimezone(now);
  const fallback: DashboardDateRange = { option: "today", ...dayRange(today) };

  const option = input.range ?? "today";

  if (option === "today") {
    return { ok: true, value: fallback };
  }

  if (option === "week") {
    const weekStart = mondayOnOrBefore(today);
    return {
      ok: true,
      value: { option: "week", from: startOfBusinessDay(weekStart), to: startOfBusinessDay({ ...weekStart, day: weekStart.day + 7 }) },
    };
  }

  if (option === "month") {
    const monthStart: CalendarDate = { year: today.year, month: today.month, day: 1 };
    return {
      ok: true,
      value: {
        option: "month",
        from: startOfBusinessDay(monthStart),
        to: startOfBusinessDay({ year: today.year, month: today.month + 1, day: 1 }),
      },
    };
  }

  if (option !== "custom") {
    return { ok: false, reason: "INVALID_RANGE_OPTION", fallback };
  }

  if (!input.from || !input.to) {
    return { ok: false, reason: "MISSING_CUSTOM_DATES", fallback };
  }

  const fromDate = parseDateOnly(input.from);
  const toDate = parseDateOnly(input.to);
  if (!fromDate || !toDate) {
    return { ok: false, reason: "INVALID_CUSTOM_DATE", fallback };
  }

  const fromSerial = calendarDateSerial(fromDate);
  const toSerial = calendarDateSerial(toDate);
  if (toSerial < fromSerial) {
    return { ok: false, reason: "CUSTOM_RANGE_INVERTED", fallback };
  }

  const spanDays = Math.round((toSerial - fromSerial) / 86_400_000) + 1;
  if (spanDays > MAX_CUSTOM_RANGE_DAYS) {
    return { ok: false, reason: "CUSTOM_RANGE_TOO_LONG", fallback };
  }

  return {
    ok: true,
    value: {
      option: "custom",
      from: startOfBusinessDay(fromDate),
      to: startOfBusinessDay({ ...toDate, day: toDate.day + 1 }),
    },
  };
}
