import { z } from "zod";

// Same normalize-then-validate shape as src/lib/validation/auth.ts's sign-in
// email field - lowercased/trimmed before lookup, since User.email is stored
// and looked up as-entered-at-signup (no DB-level citext/lower index), and
// the seller shouldn't have to type a buyer's email in exactly one case.
export const inviteBuyerInputSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Email is required").email("Must be a valid email address"),
});
export type InviteBuyerInput = z.infer<typeof inviteBuyerInputSchema>;
