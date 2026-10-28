// Pure unit tests against mocked Next.js/auth/domain modules - no
// DATABASE_URL, no local dev database, no Railway, no network at all. Same
// vi.hoisted + vi.mock pattern as tests/buyer/select-active-seller-action.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockCookieGet, mockCookieDelete, mockRequireAuthenticatedSession, mockRevokeConnectionAsBuyer, mockGetTranslations, mockRevalidatePath } =
  vi.hoisted(() => ({
    mockCookieGet: vi.fn(),
    mockCookieDelete: vi.fn(),
    mockRequireAuthenticatedSession: vi.fn(),
    mockRevokeConnectionAsBuyer: vi.fn(),
    mockGetTranslations: vi.fn(),
    mockRevalidatePath: vi.fn(),
  }));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ get: mockCookieGet, delete: mockCookieDelete })),
}));
// require-buyer.ts (imported only for the ACTIVE_BUYER_MEMBERSHIP_COOKIE
// constant, to avoid duplicating that string here) itself imports
// @/lib/auth/auth, which pulls in the real next-auth package - mocked out
// so this stays a pure unit test with no real Auth.js/Next.js server
// module resolution at all.
vi.mock("@/lib/auth/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("next-intl/server", () => ({ getTranslations: mockGetTranslations }));
vi.mock("@/lib/auth/require-authenticated", () => ({ requireAuthenticatedSession: mockRequireAuthenticatedSession }));
vi.mock("@/lib/domain/trading-relationships/trading-relationship-service", () => ({
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
  requestConnection: vi.fn(),
  revokeConnectionAsBuyer: mockRevokeConnectionAsBuyer,
}));

import { revokeConnectionAction } from "@/app/[locale]/connections/actions";
import { ACTIVE_BUYER_MEMBERSHIP_COOKIE } from "@/lib/auth/require-buyer";

const USER_ID = "buyer-user-1";
const RELATIONSHIP_ID = "relationship-1";

afterEach(() => {
  vi.clearAllMocks();
});

describe("revokeConnectionAction (buyer self-revoke)", () => {
  it("deletes the activeBuyerMembershipId cookie only when it matches the membership just revoked", async () => {
    mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, userName: "Buyer" });
    mockGetTranslations.mockResolvedValue((key: string) => key);
    mockRevokeConnectionAsBuyer.mockResolvedValue({ outcome: "revoked", relationship: {}, membershipId: "membership-1" });
    mockCookieGet.mockReturnValue({ value: "membership-1" });

    const result = await revokeConnectionAction(RELATIONSHIP_ID, { status: "idle" }, new FormData());

    expect(mockRevokeConnectionAsBuyer).toHaveBeenCalledWith(USER_ID, RELATIONSHIP_ID);
    expect(mockCookieGet).toHaveBeenCalledWith(ACTIVE_BUYER_MEMBERSHIP_COOKIE);
    expect(mockCookieDelete).toHaveBeenCalledWith(ACTIVE_BUYER_MEMBERSHIP_COOKIE);
    expect(result.status).toBe("success");
  });

  it("leaves the cookie untouched when it points at a DIFFERENT membership than the one just revoked", async () => {
    mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, userName: "Buyer" });
    mockGetTranslations.mockResolvedValue((key: string) => key);
    mockRevokeConnectionAsBuyer.mockResolvedValue({ outcome: "revoked", relationship: {}, membershipId: "membership-1" });
    mockCookieGet.mockReturnValue({ value: "membership-OTHER-still-active-seller" });

    await revokeConnectionAction(RELATIONSHIP_ID, { status: "idle" }, new FormData());

    expect(mockCookieDelete).not.toHaveBeenCalled();
  });

  it("leaves the cookie untouched when there was no membership to deactivate (membershipId null)", async () => {
    mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, userName: "Buyer" });
    mockGetTranslations.mockResolvedValue((key: string) => key);
    mockRevokeConnectionAsBuyer.mockResolvedValue({ outcome: "revoked", relationship: {}, membershipId: null });

    await revokeConnectionAction(RELATIONSHIP_ID, { status: "idle" }, new FormData());

    expect(mockCookieGet).not.toHaveBeenCalled();
    expect(mockCookieDelete).not.toHaveBeenCalled();
  });

  it("never touches the cookie when the revoke itself fails", async () => {
    mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, userName: "Buyer" });
    mockGetTranslations.mockResolvedValue((key: string) => key);
    mockRevokeConnectionAsBuyer.mockRejectedValue(new Error("not active"));

    const result = await revokeConnectionAction(RELATIONSHIP_ID, { status: "idle" }, new FormData());

    expect(result.status).toBe("error");
    expect(mockCookieGet).not.toHaveBeenCalled();
    expect(mockCookieDelete).not.toHaveBeenCalled();
  });
});
