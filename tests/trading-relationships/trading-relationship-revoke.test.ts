// Pure unit tests against fully mocked tx clients - no DATABASE_URL, no
// local dev database, no Railway, no network at all. Same style as the
// Phase 2/3/4/5 test files in this directory.
import { describe, expect, it, vi } from "vitest";
import type { TradingRelationship } from "@prisma/client";
import {
  RelationshipCustomerMismatchError,
  RelationshipForeignTenantError,
  RelationshipNotActiveError,
  RelationshipNotFoundError,
  assertOwnActiveRelationship,
  assertTenantActiveRelationshipForCustomer,
  revokeConnectionInTx,
  type RevokeConnectionTxClient,
} from "@/lib/domain/trading-relationships/trading-relationship-service";

const TENANT_ID = "tenant-1";
const OTHER_TENANT_ID = "tenant-2";
const CUSTOMER_ID = "customer-1";
const OTHER_CUSTOMER_ID = "customer-2";
const BUYER_USER_ID = "buyer-user-1";
const OTHER_USER_ID = "buyer-user-2";
const ACTOR_ID = "actor-1";

function relationshipRow(overrides: Partial<TradingRelationship> = {}): TradingRelationship {
  return {
    id: "relationship-1",
    tenantId: TENANT_ID,
    userId: BUYER_USER_ID,
    customerId: CUSTOMER_ID,
    status: "ACTIVE",
    initiatedBy: "SELLER",
    initiatedByUserId: "seller-staff-1",
    respondedByUserId: BUYER_USER_ID,
    respondedAt: new Date("2026-01-02T00:00:00.000Z"),
    revokedByUserId: null,
    revokedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeTx(overrides?: {
  customerMembership?: Partial<RevokeConnectionTxClient["customerMembership"]>;
  tradingRelationship?: Partial<RevokeConnectionTxClient["tradingRelationship"]>;
  auditLogEntry?: Partial<RevokeConnectionTxClient["auditLogEntry"]>;
}): RevokeConnectionTxClient {
  return {
    customerMembership: {
      findUnique: vi.fn().mockResolvedValue({ id: "membership-1", isActive: true }),
      update: vi.fn().mockResolvedValue({ id: "membership-1" }),
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

describe("assertOwnActiveRelationship (buyer self-revoke ownership)", () => {
  it("rejects a relationship belonging to a different user", () => {
    const foreign = relationshipRow({ userId: OTHER_USER_ID });
    expect(() => assertOwnActiveRelationship(foreign, BUYER_USER_ID)).toThrow(RelationshipNotFoundError);
  });

  it("rejects when no row was found", () => {
    expect(() => assertOwnActiveRelationship(null, BUYER_USER_ID)).toThrow(RelationshipNotFoundError);
  });

  it.each(["PENDING", "DECLINED", "REVOKED"] as const)("rejects a %s relationship", (status) => {
    const row = relationshipRow({ status });
    expect(() => assertOwnActiveRelationship(row, BUYER_USER_ID)).toThrow(RelationshipNotActiveError);
  });

  it("accepts the caller's own ACTIVE relationship", () => {
    const own = relationshipRow();
    expect(assertOwnActiveRelationship(own, BUYER_USER_ID)).toEqual(own);
  });
});

describe("assertTenantActiveRelationshipForCustomer (seller-side revoke scope)", () => {
  it("rejects a relationship belonging to a different tenant", () => {
    const foreign = relationshipRow({ tenantId: OTHER_TENANT_ID });
    expect(() => assertTenantActiveRelationshipForCustomer(foreign, TENANT_ID, CUSTOMER_ID)).toThrow(
      RelationshipForeignTenantError
    );
  });

  it("rejects when no row was found", () => {
    expect(() => assertTenantActiveRelationshipForCustomer(null, TENANT_ID, CUSTOMER_ID)).toThrow(
      RelationshipForeignTenantError
    );
  });

  it.each(["PENDING", "DECLINED", "REVOKED"] as const)("rejects a %s relationship", (status) => {
    const row = relationshipRow({ status });
    expect(() => assertTenantActiveRelationshipForCustomer(row, TENANT_ID, CUSTOMER_ID)).toThrow(
      RelationshipNotActiveError
    );
  });

  it("rejects a relationship linked to a different customer than the page being viewed", () => {
    const wrongCustomer = relationshipRow({ customerId: OTHER_CUSTOMER_ID });
    expect(() => assertTenantActiveRelationshipForCustomer(wrongCustomer, TENANT_ID, CUSTOMER_ID)).toThrow(
      RelationshipCustomerMismatchError
    );
  });

  it("accepts an ACTIVE relationship in this tenant linked to this exact customer", () => {
    const own = relationshipRow();
    expect(assertTenantActiveRelationshipForCustomer(own, TENANT_ID, CUSTOMER_ID)).toEqual(own);
  });
});

describe("revokeConnectionInTx", () => {
  it("successful revoke: marks the relationship REVOKED, deactivates the membership, and writes both audit entries atomically", async () => {
    const tx = makeTx();
    const relationship = relationshipRow();

    const result = await revokeConnectionInTx(tx, ACTOR_ID, relationship);

    expect(result.outcome).toBe("revoked");
    expect(result.relationship.status).toBe("REVOKED");
    expect(result.relationship.revokedByUserId).toBe(ACTOR_ID);
    expect(result.relationship.revokedAt).toBeInstanceOf(Date);
    expect(result.membershipId).toBe("membership-1");

    expect(tx.tradingRelationship.updateMany).toHaveBeenCalledWith({
      where: { id: relationship.id, status: "ACTIVE" },
      data: { status: "REVOKED", revokedByUserId: ACTOR_ID, revokedAt: expect.any(Date) },
    });
    expect(tx.customerMembership.update).toHaveBeenCalledWith({ where: { id: "membership-1" }, data: { isActive: false } });
    expect(tx.auditLogEntry.create).toHaveBeenCalledTimes(2);

    // Preserved, never mutated by revoke.
    expect(result.relationship.customerId).toBe(CUSTOMER_ID);
    expect(result.relationship.respondedByUserId).toBe(BUYER_USER_ID);
    expect(result.relationship.respondedAt).toEqual(relationship.respondedAt);
  });

  it("an already-inactive membership is left untouched (no redundant update, no audit)", async () => {
    const tx = makeTx({ customerMembership: { findUnique: vi.fn().mockResolvedValue({ id: "membership-1", isActive: false }) } });

    const result = await revokeConnectionInTx(tx, ACTOR_ID, relationshipRow());

    expect(tx.customerMembership.update).not.toHaveBeenCalled();
    expect(result.membershipId).toBe("membership-1");
    expect(tx.auditLogEntry.create).toHaveBeenCalledTimes(1); // only the relationship audit entry
  });

  it("no membership row at all is handled defensively (relationship still revoked, membershipId null)", async () => {
    const tx = makeTx({ customerMembership: { findUnique: vi.fn().mockResolvedValue(null) } });

    const result = await revokeConnectionInTx(tx, ACTOR_ID, relationshipRow());

    expect(result.outcome).toBe("revoked");
    expect(result.membershipId).toBeNull();
    expect(tx.customerMembership.update).not.toHaveBeenCalled();
  });

  it("lost race: throws without touching CustomerMembership or writing any audit entry when the conditional update affects 0 rows", async () => {
    const tx = makeTx({ tradingRelationship: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } });

    await expect(revokeConnectionInTx(tx, ACTOR_ID, relationshipRow())).rejects.toThrow(RelationshipNotActiveError);

    // The conditional transition is checked FIRST and throws immediately -
    // CustomerMembership is never even looked up for a lost race, let alone
    // written. (True transactional rollback is guaranteed by
    // withTenantContext's single prisma.$transaction in production, not by
    // this mock - see the function's own comment.)
    expect(tx.customerMembership.findUnique).not.toHaveBeenCalled();
    expect(tx.customerMembership.update).not.toHaveBeenCalled();
    expect(tx.auditLogEntry.create).not.toHaveBeenCalled();
  });

  it("never creates or deletes a Customer, User, or CustomerMembership row: the narrow tx client has no such methods at all", () => {
    const tx = makeTx();
    expect("create" in tx.customerMembership).toBe(false);
    expect("delete" in tx.customerMembership).toBe(false);
    expect("customer" in tx).toBe(false);
    expect("user" in tx).toBe(false);
  });
});
