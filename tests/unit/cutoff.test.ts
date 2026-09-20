import { describe, expect, it } from "vitest";
import { isPastCutOffForDelivery } from "@/lib/domain/orders/cutoff";

describe("isPastCutOffForDelivery", () => {
  const tenant = { cutOffTime: "14:00" };
  const now = new Date("2026-03-10T15:00:00"); // 15:00, past the 14:00 cut-off
  const beforeCutOffNow = new Date("2026-03-10T10:00:00"); // 10:00, before the cut-off

  it("is false when the tenant has no cut-off configured", () => {
    const tomorrow = new Date("2026-03-11T00:00:00");
    expect(isPastCutOffForDelivery({ cutOffTime: null }, tomorrow, now)).toBe(false);
  });

  it("is false when no delivery date was requested", () => {
    expect(isPastCutOffForDelivery(tenant, null, now)).toBe(false);
    expect(isPastCutOffForDelivery(tenant, undefined, now)).toBe(false);
  });

  it("warns when requesting tomorrow's delivery after today's cut-off time", () => {
    const tomorrow = new Date("2026-03-11T00:00:00");
    expect(isPastCutOffForDelivery(tenant, tomorrow, now)).toBe(true);
  });

  it("does not warn when requesting tomorrow's delivery before today's cut-off time", () => {
    const tomorrow = new Date("2026-03-11T00:00:00");
    expect(isPastCutOffForDelivery(tenant, tomorrow, beforeCutOffNow)).toBe(false);
  });

  it("does not warn for a delivery date more than one day out, even past cut-off", () => {
    const inThreeDays = new Date("2026-03-13T00:00:00");
    expect(isPastCutOffForDelivery(tenant, inThreeDays, now)).toBe(false);
  });

  it("warns for a same-day delivery request past the cut-off", () => {
    const today = new Date("2026-03-10T00:00:00");
    expect(isPastCutOffForDelivery(tenant, today, now)).toBe(true);
  });

  it("ignores a malformed cut-off time rather than throwing", () => {
    const tomorrow = new Date("2026-03-11T00:00:00");
    expect(isPastCutOffForDelivery({ cutOffTime: "not-a-time" }, tomorrow, now)).toBe(false);
  });
});
