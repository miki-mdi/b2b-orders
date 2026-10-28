// Pure unit tests against fully mocked tx clients - no DATABASE_URL, no
// local dev database, no Railway, no network at all. Same style as
// trading-relationship-service.test.ts (Phase 2) and
// tests/bootstrap/pilot-buyer-service.test.ts.
import { describe, expect, it, vi } from "vitest";
import type { TradingRelationship } from "@prisma/client";
import {
  RelationshipAlreadyRespondedError,
  RelationshipCustomerUnavailableError,
  RelationshipNotFoundError,
  RelationshipNotRespondableError,
  acceptInvitationInTx,
  assertOwnPendingSellerInvitation,
  declineInvitationInTx,
  type AcceptInvitationTxClient,
  type DeclineInvitationTxClient,
} from "@/lib/domain/trading-relationships/trading-relationship-service";

const TENANT_ID = "tenant-1";
const OTHER_TENANT_ID = "tenant-2";
const CUSTOMER_ID = "customer-1";
const BUYER_USER_ID = "buyer-user-1";
const OTHER_USER_ID = "buyer-user-2";

function relationshipRow(overrides: Partial<TradingRelationship> = {}): TradingRelationship {
  return {
    id: "relationship-1",
    tenantId: TENANT_ID,
    userId: BUYER_USER_ID,
    customerId: CUSTOMER_ID,
    status: "PENDING",
    initiatedBy: "SELLER",
    initiatedByUserId: "seller-staff-1",
    respondedByUserId: null,
    respondedAt: null,
    revokedByUserId: null,
    revokedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeAcceptTx(overrides?: {
  customer?: Partial<AcceptInvitationTxClient["customer"]>;
  customerMembership?: Partial<AcceptInvitationTxClient["customerMembership"]>;
  tradingRelationship?: Partial<AcceptInvitationTxClient["tradingRelationship"]>;
  auditLogEntry?: Partial<AcceptInvitationTxClient["auditLogEntry"]>;
}): AcceptInvitationTxClient {
  return {
    customer: {
      findUnique: vi.fn().mockResolvedValue({ id: CUSTOMER_ID, tenantId: TENANT_ID, isActive: true }),
      ...overrides?.customer,
    },
    customerMembership: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "membership-new" }),
      update: vi.fn().mockResolvedValue({ id: "membership-existing" }),
      ...overrides?.customerMembership,
    },
    tradingRelationship: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides?.tradingRelationship,
    },
    auditLogEntry: {
      create: vi.fn().mockResolvedValue({}),
      ...overrides?.auditLogEntry,
    },
  };
}

function makeDeclineTx(overrides?: {
  tradingRelationship?: Partial<DeclineInvitationTxClient["tradingRelationship"]>;
  auditLogEntry?: Partial<DeclineInvitationTxClient["auditLogEntry"]>;
}): DeclineInvitationTxClient {
  return {
    tradingRelationship: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides?.tradingRelationship,
    },
    auditLogEntry: {
      create: vi.fn().mockResolvedValue({}),
      ...overrides?.auditLogEntry,
    },
  };
}

describe("assertOwnPendingSellerInvitation", () => {
  it("rejects a relationship belonging to a different user (never accepted/declined, even though a row exists)", () => {
    const foreign = relationshipRow({ userId: OTHER_USER_ID });
    expect(() => assertOwnPendingSellerInvitation(foreign, BUYER_USER_ID)).toThrow(RelationshipNotFoundError);
  });

  it("rejects when no row was found", () => {
    expect(() => assertOwnPendingSellerInvitation(null, BUYER_USER_ID)).toThrow(RelationshipNotFoundError);
  });

  it("rejects a non-PENDING relationship", () => {
    const active = relationshipRow({ status: "ACTIVE" });
    expect(() => assertOwnPendingSellerInvitation(active, BUYER_USER_ID)).toThrow(RelationshipNotRespondableError);
  });

  it("rejects a buyer-initiated relationship (not yet a feature, but must never be respondable through this path)", () => {
    const buyerInitiated = relationshipRow({ initiatedBy: "BUYER" });
    expect(() => assertOwnPendingSellerInvitation(buyerInitiated, BUYER_USER_ID)).toThrow(RelationshipNotRespondableError);
  });

  it("accepts a PENDING, seller-initiated relationship owned by the caller", () => {
    const own = relationshipRow();
    expect(assertOwnPendingSellerInvitation(own, BUYER_USER_ID)).toEqual(own);
  });
});

describe("acceptInvitationInTx", () => {
  it("creates a new CustomerMembership, activates the relationship, and writes both audit entries", async () => {
    const tx = makeAcceptTx();
    const relationship = relationshipRow();

    const result = await acceptInvitationInTx(tx, BUYER_USER_ID, relationship);

    expect(result.outcome).toBe("activated");
    expect(result.membershipAction).toBe("created");
    expect(result.relationship.status).toBe("ACTIVE");
    expect(result.relationship.respondedByUserId).toBe(BUYER_USER_ID);

    expect(tx.customerMembership.create).toHaveBeenCalledWith({
      data: { userId: BUYER_USER_ID, customerId: CUSTOMER_ID, tenantId: TENANT_ID, role: "BUYER_ADMIN" },
    });
    expect(tx.customerMembership.update).not.toHaveBeenCalled();
    expect(tx.tradingRelationship.updateMany).toHaveBeenCalledWith({
      where: { id: relationship.id, status: "PENDING" },
      data: expect.objectContaining({ status: "ACTIVE", respondedByUserId: BUYER_USER_ID }),
    });
    expect(tx.auditLogEntry.create).toHaveBeenCalledTimes(2);
  });

  it("reactivates an existing, inactive CustomerMembership instead of creating a second one", async () => {
    const tx = makeAcceptTx({
      customerMembership: {
        findUnique: vi.fn().mockResolvedValue({ id: "membership-existing", isActive: false }),
      },
    });

    const result = await acceptInvitationInTx(tx, BUYER_USER_ID, relationshipRow());

    expect(result.membershipId).toBe("membership-existing");
    expect(result.membershipAction).toBe("reactivated");
    expect(tx.customerMembership.create).not.toHaveBeenCalled();
    expect(tx.customerMembership.update).toHaveBeenCalledWith({ where: { id: "membership-existing" }, data: { isActive: true } });
  });

  it("leaves an already-active CustomerMembership untouched (no redundant update)", async () => {
    const tx = makeAcceptTx({
      customerMembership: {
        findUnique: vi.fn().mockResolvedValue({ id: "membership-existing", isActive: true }),
      },
    });

    await acceptInvitationInTx(tx, BUYER_USER_ID, relationshipRow());

    expect(tx.customerMembership.create).not.toHaveBeenCalled();
    expect(tx.customerMembership.update).not.toHaveBeenCalled();
  });

  it("rejects when the relationship has no linked customer yet", async () => {
    const tx = makeAcceptTx();
    const relationship = relationshipRow({ customerId: null });

    await expect(acceptInvitationInTx(tx, BUYER_USER_ID, relationship)).rejects.toThrow(RelationshipCustomerUnavailableError);
    expect(tx.customer.findUnique).not.toHaveBeenCalled();
  });

  it("rejects when the linked customer no longer exists", async () => {
    const tx = makeAcceptTx({ customer: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(acceptInvitationInTx(tx, BUYER_USER_ID, relationshipRow())).rejects.toThrow(
      RelationshipCustomerUnavailableError
    );
    expect(tx.customerMembership.create).not.toHaveBeenCalled();
  });

  it("rejects when the linked customer is deactivated", async () => {
    const tx = makeAcceptTx({
      customer: { findUnique: vi.fn().mockResolvedValue({ id: CUSTOMER_ID, tenantId: TENANT_ID, isActive: false }) },
    });
    await expect(acceptInvitationInTx(tx, BUYER_USER_ID, relationshipRow())).rejects.toThrow(
      RelationshipCustomerUnavailableError
    );
    expect(tx.customerMembership.create).not.toHaveBeenCalled();
  });

  it("rejects when the linked customer belongs to a different tenant than the relationship", async () => {
    const tx = makeAcceptTx({
      customer: { findUnique: vi.fn().mockResolvedValue({ id: CUSTOMER_ID, tenantId: OTHER_TENANT_ID, isActive: true }) },
    });
    await expect(acceptInvitationInTx(tx, BUYER_USER_ID, relationshipRow())).rejects.toThrow(
      RelationshipCustomerUnavailableError
    );
    expect(tx.customerMembership.create).not.toHaveBeenCalled();
  });

  it("already-responded race: throws without writing an audit entry when the conditional update affects 0 rows", async () => {
    const tx = makeAcceptTx({ tradingRelationship: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } });

    await expect(acceptInvitationInTx(tx, BUYER_USER_ID, relationshipRow())).rejects.toThrow(RelationshipAlreadyRespondedError);

    // Atomicity note: the CustomerMembership create above DID run against
    // this mock (Prisma call order, not transactional rollback - mocks
    // can't simulate a real ROLLBACK). In production this function always
    // runs inside withTenantContext's single prisma.$transaction
    // (src/lib/db/with-tenant.ts), which only commits once the callback
    // resolves without throwing - throwing here rolls that membership
    // write back too, verified by this project's existing isolation-test
    // pattern (tests/isolation/), not re-provable with a mock. This
    // assertion instead proves the OTHER half of atomicity this function
    // controls directly: no audit entry is ever written documenting a
    // relationship/membership change that didn't actually commit.
    expect(tx.auditLogEntry.create).not.toHaveBeenCalled();
  });
});

describe("declineInvitationInTx", () => {
  it("sets the relationship to DECLINED and writes one audit entry", async () => {
    const tx = makeDeclineTx();
    const relationship = relationshipRow();

    const result = await declineInvitationInTx(tx, BUYER_USER_ID, relationship);

    expect(result.outcome).toBe("declined");
    expect(result.relationship.status).toBe("DECLINED");
    expect(result.relationship.respondedByUserId).toBe(BUYER_USER_ID);
    expect(tx.tradingRelationship.updateMany).toHaveBeenCalledWith({
      where: { id: relationship.id, status: "PENDING" },
      data: expect.objectContaining({ status: "DECLINED", respondedByUserId: BUYER_USER_ID }),
    });
    expect(tx.auditLogEntry.create).toHaveBeenCalledTimes(1);
  });

  it("never creates a CustomerMembership (decline has no such field on its narrow tx client at all)", () => {
    // Type-level guarantee, not just a runtime one: DeclineInvitationTxClient
    // has no customerMembership property, so declineInvitationInTx cannot
    // call it even if a future edit tried to - this test documents that.
    const tx = makeDeclineTx();
    expect("customerMembership" in tx).toBe(false);
  });

  it("already-responded race: throws without writing an audit entry when the conditional update affects 0 rows", async () => {
    const tx = makeDeclineTx({ tradingRelationship: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } });

    await expect(declineInvitationInTx(tx, BUYER_USER_ID, relationshipRow())).rejects.toThrow(RelationshipAlreadyRespondedError);
    expect(tx.auditLogEntry.create).not.toHaveBeenCalled();
  });
});
