// Pure unit tests against mocked Next.js/auth modules - no DATABASE_URL, no
// local dev database, no Railway, no network at all.
import { afterEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above the rest of the module, so the mock
// fns they close over must be created via vi.hoisted() - a plain top-level
// const would be a TDZ ReferenceError at the hoisted call site.
const { mockCookieSet, mockRedirect, mockAuth, mockFindOwnActiveCustomerMembership } = vi.hoisted(() => ({
  mockCookieSet: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    // Mirrors Next.js's real redirect(): it throws to halt execution, never
    // returns. The real require-buyer.ts/require-seller.ts-style code relies
    // on this (no `return` after a redirect() call) - a non-throwing mock
    // would let execution continue past it, which is NOT what production
    // does, so the mock must throw too for these tests to reflect reality.
    throw new Error(`REDIRECT:${path}`);
  }),
  mockAuth: vi.fn(),
  mockFindOwnActiveCustomerMembership: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(() => Promise.resolve({ set: mockCookieSet })) }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("@/lib/auth/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/auth/active-membership", () => ({ findOwnActiveCustomerMembership: mockFindOwnActiveCustomerMembership }));

import { selectActiveSellerAction } from "@/app/[locale]/buyer/sellers/actions";
import { ACTIVE_BUYER_MEMBERSHIP_COOKIE } from "@/lib/auth/require-buyer";

const USER_ID = "buyer-user-1";

afterEach(() => {
  vi.clearAllMocks();
});

describe("selectActiveSellerAction", () => {
  it("valid switch: sets only the activeBuyerMembershipId cookie, then redirects - no other call is made", async () => {
    mockAuth.mockResolvedValue({ user: { id: USER_ID } });
    mockFindOwnActiveCustomerMembership.mockResolvedValue({ membershipId: "membership-b" });

    await expect(selectActiveSellerAction("membership-b")).rejects.toThrow("REDIRECT:/buyer/sellers");

    expect(mockFindOwnActiveCustomerMembership).toHaveBeenCalledWith(USER_ID, "membership-b");
    expect(mockCookieSet).toHaveBeenCalledTimes(1);
    expect(mockCookieSet).toHaveBeenCalledWith(
      ACTIVE_BUYER_MEMBERSHIP_COOKIE,
      "membership-b",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" })
    );
    // Session cookie: no maxAge/expires set at all.
    const options = mockCookieSet.mock.calls[0][2];
    expect(options).not.toHaveProperty("maxAge");
    expect(options).not.toHaveProperty("expires");
  });

  it("refuses a foreign/inactive membership: does not set the cookie, still redirects", async () => {
    mockAuth.mockResolvedValue({ user: { id: USER_ID } });
    mockFindOwnActiveCustomerMembership.mockResolvedValue(null);

    await expect(selectActiveSellerAction("not-mine-or-inactive")).rejects.toThrow("REDIRECT:/buyer/sellers");

    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("redirects to sign-in when there is no authenticated session, without touching the cookie", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(selectActiveSellerAction("membership-b")).rejects.toThrow("REDIRECT:/sign-in");

    expect(mockFindOwnActiveCustomerMembership).not.toHaveBeenCalled();
    expect(mockCookieSet).not.toHaveBeenCalled();
  });
});
