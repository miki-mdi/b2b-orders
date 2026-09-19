import { describe, expect, it } from "vitest";
import {
  categoryInputSchema,
  productInputSchema,
  productUnitInputSchema,
  unitOfMeasureInputSchema,
} from "@/lib/validation/catalog";

describe("categoryInputSchema", () => {
  it("accepts a valid category", () => {
    const result = categoryInputSchema.safeParse({
      nameMk: "Пијалоци",
      nameEn: "Beverages",
      description: "",
      sortOrder: "10",
      isActive: "on",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(10);
      expect(result.data.isActive).toBe(true);
      expect(result.data.description).toBeUndefined();
    }
  });

  it("rejects a missing Macedonian or English name", () => {
    const result = categoryInputSchema.safeParse({ nameMk: "", nameEn: "", sortOrder: "0" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => issue.path[0]);
      expect(fields).toContain("nameMk");
      expect(fields).toContain("nameEn");
    }
  });

  it("rejects a negative sort order", () => {
    const result = categoryInputSchema.safeParse({ nameMk: "A", nameEn: "A", sortOrder: "-1" });
    expect(result.success).toBe(false);
  });

  it("defaults isActive to true when the checkbox is absent (unchecked)", () => {
    const result = categoryInputSchema.safeParse({ nameMk: "A", nameEn: "A" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isActive).toBe(true);
  });
});

describe("unitOfMeasureInputSchema", () => {
  it("accepts a valid unit", () => {
    const result = unitOfMeasureInputSchema.safeParse({ code: "kg", labelMk: "Килограм", labelEn: "Kilogram" });
    expect(result.success).toBe(true);
  });

  it("rejects a code longer than 10 characters", () => {
    const result = unitOfMeasureInputSchema.safeParse({
      code: "waytoolongcode",
      labelMk: "A",
      labelEn: "A",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a code with invalid characters", () => {
    const result = unitOfMeasureInputSchema.safeParse({ code: "k g!", labelMk: "A", labelEn: "A" });
    expect(result.success).toBe(false);
  });
});

describe("productInputSchema", () => {
  const base = { nameMk: "Леб", nameEn: "Bread", sku: "BREAD-001", categoryId: "some-id" };

  it("accepts a minimal valid product", () => {
    const result = productInputSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("requires a category", () => {
    const result = productInputSchema.safeParse({ ...base, categoryId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid image URL but allows an empty one", () => {
    const invalid = productInputSchema.safeParse({ ...base, imageUrl: "not-a-url" });
    expect(invalid.success).toBe(false);

    const empty = productInputSchema.safeParse({ ...base, imageUrl: "" });
    expect(empty.success).toBe(true);
  });

  it("rejects a VAT rate outside 0-100 but allows it to be omitted", () => {
    const tooHigh = productInputSchema.safeParse({ ...base, defaultVatRate: "150" });
    expect(tooHigh.success).toBe(false);

    const omitted = productInputSchema.safeParse({ ...base, defaultVatRate: "" });
    expect(omitted.success).toBe(true);
  });
});

describe("productUnitInputSchema - min quantity and increment rules", () => {
  const base = { unitOfMeasureId: "unit-1", sku: "SKU-1", label: "Piece" };

  it("accepts a valid packaging option", () => {
    const result = productUnitInputSchema.safeParse({ ...base, minOrderQty: "5", orderIncrement: "1" });
    expect(result.success).toBe(true);
  });

  it("accepts minOrderQty exactly equal to orderIncrement", () => {
    const result = productUnitInputSchema.safeParse({ ...base, minOrderQty: "1", orderIncrement: "1" });
    expect(result.success).toBe(true);
  });

  it("rejects a minOrderQty smaller than orderIncrement", () => {
    const result = productUnitInputSchema.safeParse({ ...base, minOrderQty: "2", orderIncrement: "5" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "minOrderQty")).toBe(true);
    }
  });

  it("rejects a zero or negative minOrderQty", () => {
    expect(productUnitInputSchema.safeParse({ ...base, minOrderQty: "0", orderIncrement: "1" }).success).toBe(false);
    expect(productUnitInputSchema.safeParse({ ...base, minOrderQty: "-1", orderIncrement: "1" }).success).toBe(false);
  });

  it("rejects a zero or negative orderIncrement", () => {
    expect(productUnitInputSchema.safeParse({ ...base, minOrderQty: "1", orderIncrement: "0" }).success).toBe(false);
  });

  it("allows fractional quantities (e.g. kg) as long as the min-vs-increment rule holds", () => {
    const result = productUnitInputSchema.safeParse({ ...base, minOrderQty: "2.5", orderIncrement: "0.5" });
    expect(result.success).toBe(true);
  });

  it("conversion factor is optional but must be positive when provided", () => {
    const omitted = productUnitInputSchema.safeParse({ ...base, minOrderQty: "1", orderIncrement: "1" });
    expect(omitted.success).toBe(true);

    const invalid = productUnitInputSchema.safeParse({
      ...base,
      minOrderQty: "1",
      orderIncrement: "1",
      conversionFactorToBase: "-3",
    });
    expect(invalid.success).toBe(false);
  });
});
