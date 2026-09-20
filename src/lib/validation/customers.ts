import { z } from "zod";

const optionalTrimmedString = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional()
  );

const optionalEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().max(200).email("Must be a valid email address").optional()
);

const optionalNonNegativeNumber = (max: number, label: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number({ message: `${label} must be a number` }).min(0, `${label} cannot be negative`).max(max).optional()
  );

const checkbox = z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean());

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(300),
  code: optionalTrimmedString(40),
  taxId: optionalTrimmedString(40),
  contactEmail: optionalEmail,
  contactPhone: optionalTrimmedString(40),
  notes: optionalTrimmedString(4000),
  creditLimit: optionalNonNegativeNumber(9_999_999_999, "Credit limit"),
  paymentTermsDays: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce
      .number({ message: "Payment terms must be a number" })
      .int("Payment terms must be a whole number of days")
      .min(0, "Payment terms cannot be negative")
      .max(3650)
      .optional()
  ),
  isActive: checkbox.default(true),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

/**
 * Sales Rep's "limited edit" of a customer (Phase 1F-B1) - contact info
 * only. Deliberately a separate, narrower schema rather than a partial()
 * of customerInputSchema: the domain function this feeds
 * (updateCustomerContactInfo) writes only these three columns regardless of
 * what a crafted form post contains, so a Sales Rep session can never smuggle
 * in a code/name/isActive change even past this schema - see
 * src/lib/domain/customers/customer-service.ts.
 */
export const customerContactInfoInputSchema = z.object({
  contactEmail: optionalEmail,
  contactPhone: optionalTrimmedString(40),
  notes: optionalTrimmedString(4000),
});
export type CustomerContactInfoInput = z.infer<typeof customerContactInfoInputSchema>;

export const customerAddressInputSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(100),
  recipientName: z.string().trim().min(1, "Contact person is required").max(200),
  phone: optionalTrimmedString(40),
  addressLine1: z.string().trim().min(1, "Street address is required").max(300),
  addressLine2: optionalTrimmedString(300),
  city: z.string().trim().min(1, "City is required").max(150),
  postalCode: optionalTrimmedString(20),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Country must be a 2-letter code, e.g. MK")
    .default("MK"),
  isDefaultDelivery: checkbox.default(false),
  isDefaultBilling: checkbox.default(false),
  isActive: checkbox.default(true),
});
export type CustomerAddressInput = z.infer<typeof customerAddressInputSchema>;

// Nullable on purpose: an empty submission means "clear the discount", not
// "leave it unchanged" - the form always submits the field, even when blank.
export const customerDiscountInputSchema = z.object({
  discountPercent: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.coerce
      .number({ message: "Discount must be a number" })
      .min(0, "Discount cannot be negative")
      .max(100, "Discount cannot exceed 100%")
      .nullable()
  ),
});
export type CustomerDiscountInput = z.infer<typeof customerDiscountInputSchema>;

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
