import { describe, expect, it } from "vitest";
import { customerAddressInputSchema, customerDiscountInputSchema, customerInputSchema } from "@/lib/validation/customers";
import {
  customerPriceListAssignmentInputSchema,
  priceListInputSchema,
  priceListItemInputSchema,
} from "@/lib/validation/pricing";

describe("customerInputSchema", () => {
  it("accepts a minimal valid customer", () => {
    expect(customerInputSchema.safeParse({ name: "Acme" }).success).toBe(true);
  });

  it("requires a name", () => {
    expect(customerInputSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects an invalid contact email but allows an empty one", () => {
    expect(customerInputSchema.safeParse({ name: "Acme", contactEmail: "not-an-email" }).success).toBe(false);
    expect(customerInputSchema.safeParse({ name: "Acme", contactEmail: "" }).success).toBe(true);
  });

  it("rejects a negative credit limit or payment terms", () => {
    expect(customerInputSchema.safeParse({ name: "Acme", creditLimit: "-1" }).success).toBe(false);
    expect(customerInputSchema.safeParse({ name: "Acme", paymentTermsDays: "-1" }).success).toBe(false);
  });
});

describe("customerAddressInputSchema", () => {
  const base = { label: "Main", recipientName: "Jane", addressLine1: "1 St", city: "Skopje" };

  it("accepts a minimal valid address, defaulting country to MK", () => {
    const result = customerAddressInputSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.country).toBe("MK");
  });

  it("rejects a country code that isn't 2 letters", () => {
    expect(customerAddressInputSchema.safeParse({ ...base, country: "MKD" }).success).toBe(false);
  });

  it("requires street, city, label and contact person", () => {
    expect(customerAddressInputSchema.safeParse({ ...base, addressLine1: "" }).success).toBe(false);
    expect(customerAddressInputSchema.safeParse({ ...base, city: "" }).success).toBe(false);
    expect(customerAddressInputSchema.safeParse({ ...base, label: "" }).success).toBe(false);
    expect(customerAddressInputSchema.safeParse({ ...base, recipientName: "" }).success).toBe(false);
  });
});

describe("customerDiscountInputSchema", () => {
  it("accepts a valid discount", () => {
    const result = customerDiscountInputSchema.safeParse({ discountPercent: "15" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.discountPercent).toBe(15);
  });

  it("treats an empty submission as clearing the discount (null), not an error", () => {
    const result = customerDiscountInputSchema.safeParse({ discountPercent: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.discountPercent).toBeNull();
  });

  it("rejects a discount outside 0-100", () => {
    expect(customerDiscountInputSchema.safeParse({ discountPercent: "-1" }).success).toBe(false);
    expect(customerDiscountInputSchema.safeParse({ discountPercent: "101" }).success).toBe(false);
  });
});

describe("priceListInputSchema", () => {
  it("accepts a minimal valid price list, defaulting currency to MKD", () => {
    const result = priceListInputSchema.safeParse({ name: "Standard" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.currency).toBe("MKD");
  });

  it("rejects a currency that isn't a 3-letter code", () => {
    expect(priceListInputSchema.safeParse({ name: "Standard", currency: "MK" }).success).toBe(false);
  });
});

describe("priceListItemInputSchema", () => {
  it("requires a positive price", () => {
    expect(priceListItemInputSchema.safeParse({ productUnitId: "pu-1", price: "0" }).success).toBe(false);
    expect(priceListItemInputSchema.safeParse({ productUnitId: "pu-1", price: "-5" }).success).toBe(false);
    expect(priceListItemInputSchema.safeParse({ productUnitId: "pu-1", price: "10.5" }).success).toBe(true);
  });

  it("requires a product unit", () => {
    expect(priceListItemInputSchema.safeParse({ productUnitId: "", price: "10" }).success).toBe(false);
  });
});

describe("customerPriceListAssignmentInputSchema", () => {
  it("treats an empty submission as clearing the assignment (null)", () => {
    const result = customerPriceListAssignmentInputSchema.safeParse({ priceListId: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priceListId).toBeNull();
  });

  it("accepts a real id", () => {
    const result = customerPriceListAssignmentInputSchema.safeParse({ priceListId: "pl-1" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priceListId).toBe("pl-1");
  });
});
