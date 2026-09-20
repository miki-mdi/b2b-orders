import { z } from "zod";

const optionalTrimmedString = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional()
  );

export const cartLineInputSchema = z.object({
  productUnitId: z.string().trim().min(1, "Product unit id is required"),
  quantity: z.coerce.number({ message: "Quantity must be a number" }).positive("Quantity must be greater than zero"),
});
export type CartLineInput = z.infer<typeof cartLineInputSchema>;

// A buyer's own cart never comes from a trusted source (browser localStorage,
// echoed back on submit) - this is deliberately re-parsed/re-validated here
// AND fully re-priced server-side by resolveCartLine/submitOrder. Nothing
// about quantity or productUnitId from this schema is trusted beyond "these
// are the ids/quantities to look up" - see docs/SECURITY_AND_MULTI_TENANCY.md.
export const cartInputSchema = z
  .array(cartLineInputSchema)
  .min(1, "Cart is empty")
  .max(200, "Too many distinct items in one order");

// Same shape, no minimum - used for read-only cart/checkout price previews,
// which must tolerate an empty cart rather than treat it as a validation error.
export const cartLinesQuerySchema = z.array(cartLineInputSchema).max(200);

export const submitOrderInputSchema = z.object({
  deliveryAddressId: z.string().trim().min(1, "Delivery address is required"),
  note: optionalTrimmedString(2000),
  // Coerced from an HTML date input (YYYY-MM-DD) or omitted entirely -
  // "in the past" is rejected here so a stale cut-off/allowed-day check
  // downstream never has to reason about a delivery date that has already
  // elapsed.
  requestedDeliveryDate: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce
      .date({ message: "Invalid delivery date" })
      .refine((date) => date.getTime() >= startOfToday().getTime(), "Delivery date cannot be in the past")
      .optional()
  ),
  lines: cartInputSchema,
});
export type SubmitOrderInput = z.infer<typeof submitOrderInputSchema>;

export const cancelOrderInputSchema = z.object({
  reason: optionalTrimmedString(500),
});
export type CancelOrderInput = z.infer<typeof cancelOrderInputSchema>;

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

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
