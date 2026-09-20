import { z } from "zod";

const optionalTrimmedString = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional()
  );

const checkbox = z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean());

export const priceListInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  code: optionalTrimmedString(40),
  description: optionalTrimmedString(2000),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code, e.g. MKD")
    .default("MKD"),
  isDefault: checkbox.default(false),
  isActive: checkbox.default(true),
});
export type PriceListInput = z.infer<typeof priceListInputSchema>;

export const priceListItemInputSchema = z.object({
  productUnitId: z.string().trim().min(1, "Product unit is required"),
  price: z.coerce.number({ message: "Price must be a number" }).positive("Price must be greater than zero"),
});
export type PriceListItemInput = z.infer<typeof priceListItemInputSchema>;

// Empty priceListId means "clear the assignment" - see
// src/lib/domain/customers/customer-price-list-assignment-service.ts.
export const customerPriceListAssignmentInputSchema = z.object({
  priceListId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().nullable()
  ),
});
export type CustomerPriceListAssignmentInput = z.infer<typeof customerPriceListAssignmentInputSchema>;

export const customerProductVisibilityInputSchema = z.object({
  productId: z.string().trim().min(1),
  visibility: z.enum(["VISIBLE", "HIDDEN", "DEFAULT"]),
});
export type CustomerProductVisibilityInput = z.infer<typeof customerProductVisibilityInputSchema>;

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
