import { z } from "zod";

// FormData gives every field as a string (or "on" for checked checkboxes,
// missing entirely when unchecked) - these helpers normalize that into
// what the rest of each schema expects, once, instead of repeating the
// same preprocessing in every field.
const optionalTrimmedString = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional()
  );

const checkbox = z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean());

export const categoryInputSchema = z.object({
  nameMk: z.string().trim().min(1, "Macedonian name is required").max(200),
  nameEn: z.string().trim().min(1, "English name is required").max(200),
  description: optionalTrimmedString(2000),
  sortOrder: z.coerce
    .number({ message: "Sort order must be a number" })
    .int("Sort order must be a whole number")
    .min(0, "Sort order cannot be negative")
    .max(100_000, "Sort order is too large")
    .default(0),
  isActive: checkbox.default(true),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const unitOfMeasureInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(10, "Code must be 10 characters or fewer")
    .regex(/^[a-zA-Z0-9._-]+$/, "Code may only contain letters, numbers, dots, dashes and underscores"),
  labelMk: z.string().trim().min(1, "Macedonian label is required").max(100),
  labelEn: z.string().trim().min(1, "English label is required").max(100),
  isActive: checkbox.default(true),
});
export type UnitOfMeasureInput = z.infer<typeof unitOfMeasureInputSchema>;

export const productInputSchema = z.object({
  nameMk: z.string().trim().min(1, "Macedonian name is required").max(300),
  nameEn: z.string().trim().min(1, "English name is required").max(300),
  sku: z
    .string()
    .trim()
    .min(1, "SKU is required")
    .max(64, "SKU must be 64 characters or fewer")
    .regex(/^[a-zA-Z0-9._-]+$/, "SKU may only contain letters, numbers, dots, dashes and underscores"),
  categoryId: z.string().trim().min(1, "Category is required"),
  description: optionalTrimmedString(4000),
  barcode: optionalTrimmedString(64),
  imageUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(1000).url("Must be a valid URL").optional()
  ),
  defaultVatRate: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce
      .number({ message: "VAT rate must be a number" })
      .min(0, "VAT rate cannot be negative")
      .max(100, "VAT rate cannot exceed 100")
      .optional()
  ),
  isActive: checkbox.default(true),
});
export type ProductInput = z.infer<typeof productInputSchema>;

// Business rule enforced here (see src/lib/domain/catalog/product-unit-service.ts
// for where this is also re-verified server-side independent of form input):
// a minimum order quantity smaller than a single increment step doesn't
// make sense - a buyer could never actually order the stated minimum by
// adding whole increments to it. Both values must be positive regardless.
// Deliberately NOT requiring minOrderQty to be an exact multiple of
// orderIncrement - that would over-constrain legitimate cases (e.g. a
// 2.5kg minimum with a 0.5kg increment is fine either way) and floating-
// point remainder checks on arbitrary decimals are unreliable.
export const productUnitInputSchema = z
  .object({
    unitOfMeasureId: z.string().trim().min(1, "Unit of measure is required"),
    sku: z
      .string()
      .trim()
      .min(1, "SKU is required")
      .max(64, "SKU must be 64 characters or fewer")
      .regex(/^[a-zA-Z0-9._-]+$/, "SKU may only contain letters, numbers, dots, dashes and underscores"),
    label: z.string().trim().min(1, "Label is required").max(100),
    barcode: optionalTrimmedString(64),
    conversionFactorToBase: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.coerce
        .number({ message: "Conversion factor must be a number" })
        .positive("Conversion factor must be greater than zero")
        .optional()
    ),
    minOrderQty: z.coerce
      .number({ message: "Minimum order quantity must be a number" })
      .positive("Minimum order quantity must be greater than zero"),
    orderIncrement: z.coerce
      .number({ message: "Order increment must be a number" })
      .positive("Order increment must be greater than zero"),
    isDefault: checkbox.default(false),
    isActive: checkbox.default(true),
  })
  .refine((data) => data.minOrderQty >= data.orderIncrement, {
    message: "Minimum order quantity cannot be smaller than the order increment",
    path: ["minOrderQty"],
  });
export type ProductUnitInput = z.infer<typeof productUnitInputSchema>;

/** Maps a zod validation failure into a { fieldName: message } record for form display. */
export function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}
