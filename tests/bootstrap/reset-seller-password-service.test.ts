// Pure unit tests against a fully mocked client - no DATABASE_URL, no
// local dev database, no Railway, no network at all.
import { describe, expect, it, vi } from "vitest";
import {
  resetSellerPassword,
  ResetSellerPasswordError,
  type ResetSellerPasswordClient,
} from "@/lib/bootstrap/reset-seller-password-service";

const EMAIL = "seller-admin@alpha.test";
const NEW_HASH = "bcrypt-hash-not-a-real-password";

function makeDb(overrides?: Partial<ResetSellerPasswordClient["user"]>): ResetSellerPasswordClient {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "user-1" }),
      update: vi.fn().mockResolvedValue({ id: "user-1", email: EMAIL }),
      ...overrides,
    },
  };
}

describe("resetSellerPassword", () => {
  it("updates only the matching user's passwordHash and returns its id/email", async () => {
    const db = makeDb();

    const result = await resetSellerPassword(db, EMAIL, NEW_HASH);

    expect(result).toEqual({ userId: "user-1", email: EMAIL });
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: EMAIL } });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { passwordHash: NEW_HASH } });
  });

  it("refuses when no user exists with that email - never creates one", async () => {
    const db = makeDb({ findUnique: vi.fn().mockResolvedValue(null) });

    await expect(resetSellerPassword(db, EMAIL, NEW_HASH)).rejects.toThrow(ResetSellerPasswordError);
    await expect(resetSellerPassword(db, EMAIL, NEW_HASH)).rejects.toThrow(/No user found/);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("never includes the password hash itself in its refusal message", async () => {
    const db = makeDb({ findUnique: vi.fn().mockResolvedValue(null) });
    try {
      await resetSellerPassword(db, EMAIL, NEW_HASH);
      throw new Error("expected resetSellerPassword to throw");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(NEW_HASH);
    }
  });
});
