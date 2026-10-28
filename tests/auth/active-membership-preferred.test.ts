// Pure unit tests against mocked DB-access modules - no DATABASE_URL, no
// local dev database, no Railway, no network at all. active-membership.ts
// isn't written with an injectable tx-client interface (it's not a
// per-tenant domain service, it's the login/session resolution path shared
// by Auth.js's jwt callback), so the DB-access modules it calls
// (withUserContext/withCustomerContext) are mocked at the module level
// instead - the standard Vitest way to unit-test code that isn't built
// around dependency injection.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/with-user-context", () => ({ withUserContext: vi.fn() }));
vi.mock("@/lib/db/with-tenant", () => ({ withCustomerContext: vi.fn() }));

import { withUserContext } from "@/lib/db/with-user-context";
import { withCustomerContext } from "@/lib/db/with-tenant";
import {
  findOwnActiveCustomerMembership,
  listActiveCustomerMembershipsForUser,
  resolveActiveMembership,
} from "@/lib/auth/active-membership";

const mockedWithUserContext = vi.mocked(withUserContext);
const mockedWithCustomerContext = vi.mocked(withCustomerContext);

const USER_ID = "buyer-user-1";

type FakeMembership = {
  id: string;
  userId: string;
  tenantId: string;
  customerId: string;
  role: "BUYER_ADMIN" | "BUYER_EMPLOYEE";
  isActive: boolean;
};
type FakeCustomer = { name: string; isActive: boolean; tenant: { name: string; status: "ACTIVE" | "SUSPENDED" } };

/** Wires both mocked DB-access functions against a simple in-memory fixture, matching the real shapes active-membership.ts reads. */
function setupFixture(params: {
  user: { id: string; isActive: boolean } | null;
  customerMemberships: FakeMembership[];
  // Keyed by `${tenantId}:${customerId}` - what withCustomerContext would scope a Customer lookup to.
  customers: Record<string, FakeCustomer>;
}) {
  mockedWithUserContext.mockImplementation(async (userId, fn) => {
    if (!params.user || userId !== params.user.id) return fn(undefined as never);
    const fakeTx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          ...params.user,
          isPlatformAdmin: false,
          tenantMemberships: [],
          customerMemberships: params.customerMemberships,
        }),
      },
      customerMembership: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(params.customerMemberships.find((m) => m.id === where.id) ?? null)
        ),
      },
    };
    return fn(fakeTx as never);
  });

  mockedWithCustomerContext.mockImplementation(async (tenantId, customerId, fn) => {
    const key = `${tenantId}:${customerId}`;
    const customer = params.customers[key];
    const fakeTx = {
      customer: { findUnique: vi.fn().mockResolvedValue(customer ? { ...customer } : null) },
    };
    return fn(fakeTx as never);
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

const SELLER_A = { tenantId: "tenant-a", customerId: "customer-a", membershipId: "membership-a" };
const SELLER_B = { tenantId: "tenant-b", customerId: "customer-b", membershipId: "membership-b" };

const TWO_ACTIVE_SELLERS_FIXTURE = {
  user: { id: USER_ID, isActive: true },
  customerMemberships: [
    { id: SELLER_A.membershipId, userId: USER_ID, tenantId: SELLER_A.tenantId, customerId: SELLER_A.customerId, role: "BUYER_ADMIN" as const, isActive: true },
    { id: SELLER_B.membershipId, userId: USER_ID, tenantId: SELLER_B.tenantId, customerId: SELLER_B.customerId, role: "BUYER_ADMIN" as const, isActive: true },
  ],
  customers: {
    [`${SELLER_A.tenantId}:${SELLER_A.customerId}`]: { name: "Seller A Customer", isActive: true, tenant: { name: "Seller A", status: "ACTIVE" as const } },
    [`${SELLER_B.tenantId}:${SELLER_B.customerId}`]: { name: "Seller B Customer", isActive: true, tenant: { name: "Seller B", status: "ACTIVE" as const } },
  },
};

describe("resolveActiveMembership - preferredMembershipId (buyer seller-switcher)", () => {
  it("a preferred membership belonging to the caller overrides the default (first-wins) choice", async () => {
    setupFixture(TWO_ACTIVE_SELLERS_FIXTURE);

    // Default (no preference) picks Seller A, the first valid one.
    const withoutPreference = await resolveActiveMembership(USER_ID);
    expect(withoutPreference.activeMembership).toMatchObject({ type: "CUSTOMER", tenantId: SELLER_A.tenantId });

    // With a preference for Seller B, it wins instead.
    const withPreference = await resolveActiveMembership(USER_ID, SELLER_B.membershipId);
    expect(withPreference.activeMembership).toMatchObject({ type: "CUSTOMER", tenantId: SELLER_B.tenantId });
  });

  it("an absent preference preserves the current default behavior exactly", async () => {
    setupFixture(TWO_ACTIVE_SELLERS_FIXTURE);
    const result = await resolveActiveMembership(USER_ID, undefined);
    expect(result.activeMembership).toMatchObject({ type: "CUSTOMER", tenantId: SELLER_A.tenantId });
  });

  it("a foreign membership id (belonging to no membership this user has) is ignored and falls back to the default", async () => {
    setupFixture(TWO_ACTIVE_SELLERS_FIXTURE);
    const result = await resolveActiveMembership(USER_ID, "membership-belonging-to-someone-else");
    expect(result.activeMembership).toMatchObject({ type: "CUSTOMER", tenantId: SELLER_A.tenantId });
  });

  it("a preferred membership whose Customer is inactive is ignored and falls back to the default", async () => {
    setupFixture({
      ...TWO_ACTIVE_SELLERS_FIXTURE,
      customers: {
        ...TWO_ACTIVE_SELLERS_FIXTURE.customers,
        [`${SELLER_B.tenantId}:${SELLER_B.customerId}`]: { name: "Seller B Customer", isActive: false, tenant: { name: "Seller B", status: "ACTIVE" } },
      },
    });
    const result = await resolveActiveMembership(USER_ID, SELLER_B.membershipId);
    expect(result.activeMembership).toMatchObject({ type: "CUSTOMER", tenantId: SELLER_A.tenantId });
  });

  it("a preferred membership whose Tenant is suspended is ignored and falls back to the default", async () => {
    setupFixture({
      ...TWO_ACTIVE_SELLERS_FIXTURE,
      customers: {
        ...TWO_ACTIVE_SELLERS_FIXTURE.customers,
        [`${SELLER_B.tenantId}:${SELLER_B.customerId}`]: { name: "Seller B Customer", isActive: true, tenant: { name: "Seller B", status: "SUSPENDED" } },
      },
    });
    const result = await resolveActiveMembership(USER_ID, SELLER_B.membershipId);
    expect(result.activeMembership).toMatchObject({ type: "CUSTOMER", tenantId: SELLER_A.tenantId });
  });

  it("two simulated browser requests with different cookie values resolve different sellers for the same buyer", async () => {
    setupFixture(TWO_ACTIVE_SELLERS_FIXTURE);

    // Simulates two separate browsers, each sending its own cookie value on
    // an otherwise-identical request for the same userId.
    const browserOneResult = await resolveActiveMembership(USER_ID, SELLER_A.membershipId);
    const browserTwoResult = await resolveActiveMembership(USER_ID, SELLER_B.membershipId);

    expect(browserOneResult.activeMembership).toMatchObject({ type: "CUSTOMER", tenantId: SELLER_A.tenantId });
    expect(browserTwoResult.activeMembership).toMatchObject({ type: "CUSTOMER", tenantId: SELLER_B.tenantId });
  });

  it("a stale preferred cookie for a membership deactivated since it was set falls back on the very next fresh request", async () => {
    // First request: Seller B's membership is still active, preference applies.
    setupFixture(TWO_ACTIVE_SELLERS_FIXTURE);
    const before = await resolveActiveMembership(USER_ID, SELLER_B.membershipId);
    expect(before.activeMembership).toMatchObject({ type: "CUSTOMER", tenantId: SELLER_B.tenantId });

    // Revoked/deactivated: Seller B's CustomerMembership row is no longer
    // in the active set at all (the `isActive: true` filter this codebase
    // already applies at the query level would simply exclude it).
    setupFixture({
      ...TWO_ACTIVE_SELLERS_FIXTURE,
      customerMemberships: [TWO_ACTIVE_SELLERS_FIXTURE.customerMemberships[0]],
    });
    const after = await resolveActiveMembership(USER_ID, SELLER_B.membershipId);
    expect(after.activeMembership).toMatchObject({ type: "CUSTOMER", tenantId: SELLER_A.tenantId });
  });
});

describe("listActiveCustomerMembershipsForUser", () => {
  it("lists every currently-valid active membership, excluding inactive customers/suspended tenants", async () => {
    setupFixture({
      ...TWO_ACTIVE_SELLERS_FIXTURE,
      customers: {
        ...TWO_ACTIVE_SELLERS_FIXTURE.customers,
        [`${SELLER_B.tenantId}:${SELLER_B.customerId}`]: { name: "Seller B Customer", isActive: true, tenant: { name: "Seller B", status: "SUSPENDED" } },
      },
    });

    const options = await listActiveCustomerMembershipsForUser(USER_ID);
    expect(options).toEqual([
      {
        membershipId: SELLER_A.membershipId,
        tenantId: SELLER_A.tenantId,
        customerId: SELLER_A.customerId,
        tenantName: "Seller A",
        customerName: "Seller A Customer",
      },
    ]);
  });
});

describe("findOwnActiveCustomerMembership (used by the switch action)", () => {
  it("returns the membership when it belongs to the caller and is currently valid", async () => {
    setupFixture(TWO_ACTIVE_SELLERS_FIXTURE);
    const result = await findOwnActiveCustomerMembership(USER_ID, SELLER_B.membershipId);
    expect(result).toEqual({ membershipId: SELLER_B.membershipId });
  });

  it("returns null for a membership id that doesn't exist at all", async () => {
    setupFixture(TWO_ACTIVE_SELLERS_FIXTURE);
    const result = await findOwnActiveCustomerMembership(USER_ID, "does-not-exist");
    expect(result).toBeNull();
  });

  it("defense-in-depth: returns null if a row were ever returned for a different user's id (RLS would already exclude this in production)", async () => {
    mockedWithUserContext.mockImplementation(async (userId, fn) => {
      const fakeTx = {
        customerMembership: {
          // Simulates the hypothetical case where the underlying query
          // returned someone else's row - RLS's self-row SELECT policy
          // (userId = app.current_user_id) already makes this impossible in
          // production; this test exists to prove the explicit ownership
          // check in findOwnActiveCustomerMembership is the second,
          // independent layer, not the only one.
          findUnique: vi.fn().mockResolvedValue({
            id: "membership-x",
            userId: "a-completely-different-user",
            tenantId: SELLER_A.tenantId,
            customerId: SELLER_A.customerId,
            isActive: true,
          }),
        },
      };
      return fn(fakeTx as never);
    });

    const result = await findOwnActiveCustomerMembership(USER_ID, "membership-x");
    expect(result).toBeNull();
  });

  it("returns null when the Customer linked to the membership is inactive", async () => {
    setupFixture({
      ...TWO_ACTIVE_SELLERS_FIXTURE,
      customers: {
        ...TWO_ACTIVE_SELLERS_FIXTURE.customers,
        [`${SELLER_B.tenantId}:${SELLER_B.customerId}`]: { name: "Seller B Customer", isActive: false, tenant: { name: "Seller B", status: "ACTIVE" } },
      },
    });
    const result = await findOwnActiveCustomerMembership(USER_ID, SELLER_B.membershipId);
    expect(result).toBeNull();
  });

  it("returns null when the linked Tenant is suspended", async () => {
    setupFixture({
      ...TWO_ACTIVE_SELLERS_FIXTURE,
      customers: {
        ...TWO_ACTIVE_SELLERS_FIXTURE.customers,
        [`${SELLER_B.tenantId}:${SELLER_B.customerId}`]: { name: "Seller B Customer", isActive: true, tenant: { name: "Seller B", status: "SUSPENDED" } },
      },
    });
    const result = await findOwnActiveCustomerMembership(USER_ID, SELLER_B.membershipId);
    expect(result).toBeNull();
  });
});

describe("resolveActiveMembership - after revoking the buyer's only relationship (Phase 6)", () => {
  it("resolves to no active membership once the user's sole CustomerMembership is deactivated", async () => {
    // Mirrors exactly what revokeConnectionInTx does in production: sets
    // CustomerMembership.isActive = false. The real query this codebase
    // uses (`customerMemberships: { where: { isActive: true } }` in
    // resolveActiveMembership) means a revoked membership is simply absent
    // from the list a fresh request sees - there is nothing left to select.
    setupFixture({
      user: { id: USER_ID, isActive: true },
      customerMemberships: [],
      customers: {},
    });

    const result = await resolveActiveMembership(USER_ID);

    expect(result.isActive).toBe(true); // the User account itself is untouched by revoke
    expect(result.activeMembership).toBeNull();
    // This is precisely the condition requireBuyerSession() (src/lib/auth/require-buyer.ts)
    // redirects away on - a buyer who just had their only relationship
    // revoked loses /buyer/* access on the very next request.
    // requireAuthenticatedSession() (src/lib/auth/require-authenticated.ts),
    // by contrast, only calls auth() and never looks at activeMembership at
    // all, so /connections stays reachable - proven by that function's own
    // unconditional success path, not re-tested here since this module
    // doesn't touch it.
  });
});
