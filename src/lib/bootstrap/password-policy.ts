// Pure validation for operator-entered pilot account passwords (bootstrap
// admin, pilot buyer) - deliberately stricter than the app's ordinary
// sign-in minimum (src/lib/validation/auth.ts's z.string().min(8)), since
// these are operator-created accounts set up outside the normal sign-up flow.
const MIN_LENGTH = 12;

export function validatePassword(password: string): { ok: true } | { ok: false; reason: string } {
  if (password.length === 0) {
    return { ok: false, reason: "Password must not be empty." };
  }
  if (password.length < MIN_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_LENGTH} characters.` };
  }
  return { ok: true };
}

export function passwordsMatch(first: string, second: string): boolean {
  return first === second;
}
