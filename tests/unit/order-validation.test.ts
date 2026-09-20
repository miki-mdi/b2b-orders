import { describe, expect, it } from "vitest";
import { cancelOrderInputSchema, cartInputSchema, cartLineInputSchema, submitOrderInputSchema } from "@/lib/validation/orders";

describe("cartLineInputSchema", () => {
  it("accepts a positive quantity", () => {
    expect(cartLineInputSchema.safeParse({ productUnitId: "abc", quantity: 2 }).success).toBe(true);
  });

  it("rejects a zero or negative quantity", () => {
    expect(cartLineInputSchema.safeParse({ productUnitId: "abc", quantity: 0 }).success).toBe(false);
    expect(cartLineInputSchema.safeParse({ productUnitId: "abc", quantity: -1 }).success).toBe(false);
  });

  it("rejects a missing product unit id", () => {
    expect(cartLineInputSchema.safeParse({ productUnitId: "", quantity: 1 }).success).toBe(false);
  });
});

describe("cartInputSchema", () => {
  it("rejects an empty cart", () => {
    expect(cartInputSchema.safeParse([]).success).toBe(false);
  });

  it("accepts a non-empty cart", () => {
    expect(cartInputSchema.safeParse([{ productUnitId: "a", quantity: 1 }]).success).toBe(true);
  });
});

describe("submitOrderInputSchema", () => {
  const validLines = [{ productUnitId: "pu-1", quantity: 2 }];

  it("requires a delivery address and at least one line", () => {
    expect(submitOrderInputSchema.safeParse({ deliveryAddressId: "", lines: validLines }).success).toBe(false);
    expect(submitOrderInputSchema.safeParse({ deliveryAddressId: "addr-1", lines: [] }).success).toBe(false);
  });

  it("accepts a minimal valid submission with no note or delivery date", () => {
    const result = submitOrderInputSchema.safeParse({ deliveryAddressId: "addr-1", lines: validLines });
    expect(result.success).toBe(true);
  });

  it("rejects a requested delivery date in the past", () => {
    const result = submitOrderInputSchema.safeParse({
      deliveryAddressId: "addr-1",
      lines: validLines,
      requestedDeliveryDate: "2000-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a future requested delivery date", () => {
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 1);
    const result = submitOrderInputSchema.safeParse({
      deliveryAddressId: "addr-1",
      lines: validLines,
      requestedDeliveryDate: farFuture.toISOString().slice(0, 10),
    });
    expect(result.success).toBe(true);
  });
});

describe("cancelOrderInputSchema", () => {
  it("allows an empty/omitted reason", () => {
    expect(cancelOrderInputSchema.safeParse({}).success).toBe(true);
    expect(cancelOrderInputSchema.safeParse({ reason: "" }).success).toBe(true);
  });

  it("accepts a provided reason", () => {
    expect(cancelOrderInputSchema.safeParse({ reason: "Changed my mind" }).success).toBe(true);
  });
});
