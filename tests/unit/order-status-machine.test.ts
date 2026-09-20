import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@prisma/client";
import {
  assertValidOrderTransition,
  InvalidOrderTransitionError,
  isValidOrderTransition,
  ORDER_STATUS_TRANSITIONS,
} from "@/lib/domain/orders/order-status-machine";

const ALL_STATUSES: OrderStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "CONFIRMED",
  "CANCELLED",
  "PICKING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

describe("order status machine", () => {
  it("allows the full documented forward path", () => {
    expect(isValidOrderTransition("SUBMITTED", "CONFIRMED")).toBe(true);
    expect(isValidOrderTransition("CONFIRMED", "PICKING")).toBe(true);
    expect(isValidOrderTransition("PICKING", "READY")).toBe(true);
    expect(isValidOrderTransition("READY", "OUT_FOR_DELIVERY")).toBe(true);
    expect(isValidOrderTransition("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
  });

  it("allows cancellation only from SUBMITTED", () => {
    expect(isValidOrderTransition("SUBMITTED", "CANCELLED")).toBe(true);
    expect(isValidOrderTransition("CONFIRMED", "CANCELLED")).toBe(false);
    expect(isValidOrderTransition("PICKING", "CANCELLED")).toBe(false);
  });

  it("rejects skipping a stage forward", () => {
    expect(isValidOrderTransition("SUBMITTED", "PICKING")).toBe(false);
    expect(isValidOrderTransition("CONFIRMED", "READY")).toBe(false);
    expect(isValidOrderTransition("SUBMITTED", "DELIVERED")).toBe(false);
  });

  it("rejects any backward transition", () => {
    expect(isValidOrderTransition("DELIVERED", "OUT_FOR_DELIVERY")).toBe(false);
    expect(isValidOrderTransition("READY", "PICKING")).toBe(false);
    expect(isValidOrderTransition("CONFIRMED", "SUBMITTED")).toBe(false);
  });

  it("DELIVERED and CANCELLED are terminal - no outgoing transition at all", () => {
    for (const target of ALL_STATUSES) {
      expect(isValidOrderTransition("DELIVERED", target)).toBe(false);
      expect(isValidOrderTransition("CANCELLED", target)).toBe(false);
    }
  });

  it("DRAFT has no modeled outgoing transition (nothing in this codebase creates one)", () => {
    expect(ORDER_STATUS_TRANSITIONS.DRAFT).toEqual([]);
  });

  it("assertValidOrderTransition throws InvalidOrderTransitionError on an illegal move", () => {
    expect(() => assertValidOrderTransition("DELIVERED", "PICKING")).toThrow(InvalidOrderTransitionError);
    expect(() => assertValidOrderTransition("SUBMITTED", "CONFIRMED")).not.toThrow();
  });
});
