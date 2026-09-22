import { describe, expect, it } from "vitest";
import { MAX_CUSTOM_RANGE_DAYS, resolveDashboardDateRange } from "@/lib/domain/dashboard/date-range";

function isoDateInSkopje(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Skopje", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date
  );
}

function weekdayShortInSkopje(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Skopje", weekday: "short" }).format(date);
}

function wallClockTimeInSkopje(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Skopje",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

/** Hours between "today"'s from/to for every day of `year`-`month`, at a noon-UTC anchor (always safely inside the same Europe/Skopje calendar day regardless of the +1/+2 offset). */
function todaySpansForMonth(year: number, month: number): number[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const spans: number[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const now = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const result = resolveDashboardDateRange({ range: "today" }, now);
    if (!result.ok) throw new Error("expected today to always resolve");
    spans.push((result.value.to.getTime() - result.value.from.getTime()) / 3_600_000);
  }
  return spans;
}

describe("resolveDashboardDateRange: today", () => {
  it("both boundaries read exactly 00:00:00 in Europe/Skopje wall-clock time", () => {
    const now = new Date(Date.UTC(2026, 5, 15, 10, 0, 0));
    const result = resolveDashboardDateRange({ range: "today" }, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(wallClockTimeInSkopje(result.value.from)).toBe("00:00:00");
    expect(wallClockTimeInSkopje(result.value.to)).toBe("00:00:00");
    expect(isoDateInSkopje(result.value.from)).toBe("2026-06-15");
    expect(isoDateInSkopje(result.value.to)).toBe("2026-06-16");
  });

  it("defaults to today when no range option is given", () => {
    const now = new Date(Date.UTC(2026, 5, 15, 10, 0, 0));
    const result = resolveDashboardDateRange({}, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.option).toBe("today");
  });

  it("reflects the real Europe/Skopje DST transitions, not a naive fixed-24h assumption", () => {
    // 2026's EU spring-forward (last Sunday of March: clocks 02:00 -> 03:00)
    // makes exactly one March day 23 hours long; the autumn fall-back (last
    // Sunday of October: clocks 03:00 -> 02:00) makes exactly one October
    // day 25 hours long. Scanning the whole month avoids hardcoding which
    // calendar date that is.
    const marchSpans = todaySpansForMonth(2026, 3);
    const octoberSpans = todaySpansForMonth(2026, 10);

    expect(marchSpans.filter((h) => h === 23)).toHaveLength(1);
    expect(marchSpans.every((h) => h === 23 || h === 24)).toBe(true);

    expect(octoberSpans.filter((h) => h === 25)).toHaveLength(1);
    expect(octoberSpans.every((h) => h === 25 || h === 24)).toBe(true);
  });
});

describe("resolveDashboardDateRange: week", () => {
  it("starts on Monday and spans exactly 7 days, for every day of the week (Europe/Skopje)", () => {
    // 2026-06-21..27 - a full week with no DST transition, so the span is a
    // clean 7*24h in every case; the Monday-start property is checked
    // independently of which day of the week `now` itself is.
    for (let day = 21; day <= 27; day++) {
      const now = new Date(Date.UTC(2026, 5, day, 10, 0, 0));
      const result = resolveDashboardDateRange({ range: "week" }, now);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(weekdayShortInSkopje(result.value.from)).toBe("Mon");
      expect(wallClockTimeInSkopje(result.value.from)).toBe("00:00:00");
      const spanDays = (result.value.to.getTime() - result.value.from.getTime()) / 86_400_000;
      expect(spanDays).toBe(7);
    }
  });
});

describe("resolveDashboardDateRange: month", () => {
  it("spans the 1st of the month through the 1st of the next month", () => {
    const now = new Date(Date.UTC(2026, 5, 15, 10, 0, 0));
    const result = resolveDashboardDateRange({ range: "month" }, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isoDateInSkopje(result.value.from)).toBe("2026-06-01");
    expect(isoDateInSkopje(result.value.to)).toBe("2026-07-01");
  });

  it("rolls over the year at December", () => {
    const now = new Date(Date.UTC(2026, 11, 15, 10, 0, 0));
    const result = resolveDashboardDateRange({ range: "month" }, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isoDateInSkopje(result.value.from)).toBe("2026-12-01");
    expect(isoDateInSkopje(result.value.to)).toBe("2027-01-01");
  });
});

describe("resolveDashboardDateRange: custom", () => {
  const now = new Date(Date.UTC(2026, 5, 15, 10, 0, 0));

  it("treats 'to' as an inclusive calendar day (implemented as the next day's exclusive start)", () => {
    const result = resolveDashboardDateRange({ range: "custom", from: "2026-01-05", to: "2026-01-05" }, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isoDateInSkopje(result.value.from)).toBe("2026-01-05");
    expect(isoDateInSkopje(result.value.to)).toBe("2026-01-06");
  });

  it("spans a multi-day range correctly", () => {
    const result = resolveDashboardDateRange({ range: "custom", from: "2026-01-01", to: "2026-01-31" }, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isoDateInSkopje(result.value.from)).toBe("2026-01-01");
    expect(isoDateInSkopje(result.value.to)).toBe("2026-02-01");
  });

  it("accepts exactly the maximum span (366 days)", () => {
    // 2024 is a leap year: 2024-01-01 through 2024-12-31 inclusive is
    // exactly 366 calendar days.
    const result = resolveDashboardDateRange({ range: "custom", from: "2024-01-01", to: "2024-12-31" }, now);
    expect(result.ok).toBe(true);
  });

  it("rejects a span one day over the maximum", () => {
    const result = resolveDashboardDateRange({ range: "custom", from: "2024-01-01", to: "2025-01-01" }, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("CUSTOM_RANGE_TOO_LONG");
    expect(result.fallback.option).toBe("today");
  });

  it("rejects an inverted range (to before from)", () => {
    const result = resolveDashboardDateRange({ range: "custom", from: "2026-02-10", to: "2026-02-01" }, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("CUSTOM_RANGE_INVERTED");
  });

  it("rejects missing from/to", () => {
    const result = resolveDashboardDateRange({ range: "custom" }, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("MISSING_CUSTOM_DATES");
  });

  it("rejects a malformed date string", () => {
    const result = resolveDashboardDateRange({ range: "custom", from: "2026/02/01", to: "2026-02-10" }, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("INVALID_CUSTOM_DATE");
  });

  it("rejects a calendar-impossible date (Date.UTC would otherwise silently roll it over)", () => {
    const result = resolveDashboardDateRange({ range: "custom", from: "2026-02-30", to: "2026-03-01" }, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("INVALID_CUSTOM_DATE");
  });

  it("MAX_CUSTOM_RANGE_DAYS is exported and equals 366", () => {
    expect(MAX_CUSTOM_RANGE_DAYS).toBe(366);
  });
});

describe("resolveDashboardDateRange: invalid range option", () => {
  it("falls back to today rather than throwing", () => {
    const now = new Date(Date.UTC(2026, 5, 15, 10, 0, 0));
    const result = resolveDashboardDateRange({ range: "not-a-real-option" }, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("INVALID_RANGE_OPTION");
    expect(result.fallback.option).toBe("today");
    expect(isoDateInSkopje(result.fallback.from)).toBe("2026-06-15");
  });
});
