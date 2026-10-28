// Pure unit tests against fully mocked tx clients - no DATABASE_URL, no
// local dev database, no Railway, no network at all. Same style as the
// Phase 2/3/4 test files in this directory.
import { describe, expect, it, vi } from "vitest";
import type { TradingRelationship } from "@prisma/client";
import {
  RelationshipAlreadyRespondedError,
  RelationshipForeignTenantError,
  RelationshipNotRequestableError,
  SelectedCustomerUnavailableError,
  assertTenantPendingBuyerRequest,
  sellerAcceptRequestInTx,
  sellerDeclineRequestInTx,
  type SellerAcceptRequestTxClient,
  type SellerDeclineRequestTxClient,
} from "@/lib/domain/trading-relationships/trading-relationship-service";

const TENANT_ID = "tenant-1";
const OTHER_TENANT_ID = "tenant-2";
const CUSTOMER_ID = "customer-1";
const BUYER_USER_ID = "buyer-user-1";
const SELLER_ACTOR_ID = "seller-staff-1";

function relationshipRow(overrides: Partial<TradingRelationship> = {}): TradingRelationship {
  return {
    id: "relationship-1",
    tenantId: TENANT_ID,
    userId: BUYER_USER_ID,
    customerId: null,
    status: "PENDING",
    initiatedBy: "BUYER",
    initiatedByUserId: BUYER_USER_ID,
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
  customer?: Partial<SellerAcceptRequestTxClient["customer"]>;
  customerMembership?: Partial<SellerAcceptRequestTxClient["customerMembership"]>;
  tradingRelationship?: Partial<SellerAcceptRequestTxClient["tradingRelationship"]>;
  auditLogEntry?: Partial<SellerAcceptRequestTxClient["auditLogEntry"]>;
}): SellerAcceptRequestTxClient {
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
  tradingRelationship?: Partial<SellerDeclineRequestTxClient["tradingRelationship"]>;
  auditLogEntry?: Partial<SellerDeclineRequestTxClient["auditLogEntry"]>;
}): SellerDeclineRequestTxClient {
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

describe("assertTenantPendingBuyerRequest", () => {
  it("rejects a relationship belonging to a different tenant", () => {
    const foreign = relationshipRow({ tenantId: OTHER_TENANT_ID });
    expect(() => assertTenantPendingBuyerRequest(foreign, TENANT_ID)).toThrow(RelationshipForeignTenantError);
  });

  it("rejects when no row was found", () => {
    expect(() => assertTenantPendingBuyerRequest(null, TENANT_ID)).toThrow(RelationshipForeignTenantError);
  });

  it("rejects a non-PENDING relationship", () => {
    const active = relationshipRow({ status: "ACTIVE" });
    expect(() => assertTenantPendingBuyerRequest(active, TENANT_ID)).toThrow(RelationshipNotRequestableError);
  });

  it("rejects a seller-initiated relationship (that's a Phase 2 invitation, not a buyer request)", () => {
    const sellerInitiated = relationshipRow({ initiatedBy: "SELLER" });
    expect(() => assertTenantPendingBuyerRequest(sellerInitiated, TENANT_ID)).toThrow(RelationshipNotRequestableError);
  });

  it("accepts a PENDING, buyer-initiated relationship belonging to this tenant", () => {
    const own = relationshipRow();
    expect(assertTenantPendingBuyerRequest(own, TENANT_ID)).toEqual(own);
  });
});

describe("sellerAcceptRequestInTx", () => {
  it("creates a new CustomerMembership, activates the relationship with the selected customer, and writes both audit entries", async () => {
    const tx = makeAcceptTx();
    const relationship = relationshipRow();

    const result = await sellerAcceptRequestInTx(tx, SELLER_ACTOR_ID, relationship, CUSTOMER_ID);

    expect(result.outcome).toBe("activated");
    expect(result.membershipAction).toBe("created");
    expect(result.relationship.status).toBe("ACTIVE");
    expect(result.relationship.customerId).toBe(CUSTOMER_ID);
    expect(result.relationship.respondedByUserId).toBe(SELLER_ACTOR_ID);

    expect(tx.customerMembership.create).toHaveBeenCalledWith({
      data: { userId: BUYER_USER_ID, customerId: CUSTOMER_ID, tenantId: TENANT_ID, role: "BUYER_ADMIN" },
    });
    expect(tx.customerMembership.update).not.toHaveBeenCalled();
    expect(tx.tradingRelationship.updateMany).toHaveBeenCalledWith({
      where: { id: relationship.id, status: "PENDING" },
      data: { status: "ACTIVE", customerId: CUSTOMER_ID, respondedByUserId: SELLER_ACTOR_ID, respondedAt: expect.any(Date) },
    });
    expect(tx.auditLogEntry.create).toHaveBeenCalledTimes(2);
  });

  it("reactivates an existing, inactive CustomerMembership instead of creating a second one", async () => {
    const tx = makeAcceptTx({
      customerMembership: { findUnique: vi.fn().mockResolvedValue({ id: "membership-existing", isActive: false }) },
    });

    const result = await sellerAcceptRequestInTx(tx, SELLER_ACTOR_ID, relationshipRow(), CUSTOMER_ID);

    expect(result.membershipId).toBe("membership-existing");
    expect(result.membershipAction).toBe("reactivated");
    expect(tx.customerMembership.create).not.toHaveBeenCalled();
    expect(tx.customerMembership.update).toHaveBeenCalledWith({ where: { id: "membership-existing" }, data: { isActive: true } });
  });

  it("rejects when the selected customer does not exist", async () => {
    const tx = makeAcceptTx({ customer: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(sellerAcceptRequestInTx(tx, SELLER_ACTOR_ID, relationshipRow(), CUSTOMER_ID)).rejects.toThrow(
      SelectedCustomerUnavailableError
    );
    expect(tx.customerMembership.create).not.toHaveBeenCalled();
  });

  it("rejects when the selected customer is inactive", async () => {
    const tx = makeAcceptTx({
      customer: { findUnique: vi.fn().mockResolvedValue({ id: CUSTOMER_ID, tenantId: TENANT_ID, isActive: false }) },
    });
    await expect(sellerAcceptRequestInTx(tx, SELLER_ACTOR_ID, relationshipRow(), CUSTOMER_ID)).rejects.toThrow(
      SelectedCustomerUnavailableError
    );
    expect(tx.customerMembership.create).not.toHaveBeenCalled();
  });

  it("rejects a selected customer belonging to a different tenant - never accepted across tenants", async () => {
    const tx = makeAcceptTx({
      customer: { findUnique: vi.fn().mockResolvedValue({ id: CUSTOMER_ID, tenantId: OTHER_TENANT_ID, isActive: true }) },
    });
    await expect(sellerAcceptRequestInTx(tx, SELLER_ACTOR_ID, relationshipRow(), CUSTOMER_ID)).rejects.toThrow(
      SelectedCustomerUnavailableError
    );
    expect(tx.customerMembership.create).not.toHaveBeenCalled();
  });

  it("lost accept race: throws without writing any audit entry when the conditional update affects 0 rows", async () => {
    const tx = makeAcceptTx({ tradingRelationship: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } });

    await expect(sellerAcceptRequestInTx(tx, SELLER_ACTOR_ID, relationshipRow(), CUSTOMER_ID)).rejects.toThrow(
      RelationshipAlreadyRespondedError
    );

    // Atomicity note: the CustomerMembership create above DID run against
    // this mock (Prisma call order, not transactional rollback - mocks
    // can't simulate a real ROLLBACK). In production this always runs
    // inside withTenantContext's single prisma.$transaction
    // (src/lib/db/with-tenant.ts), which only commits once the callback
    // resolves without throwing - throwing here rolls that membership
    // write back too. This assertion proves the other half of atomicity
    // this function controls directly: no audit entry is ever written
    // documenting a membership/relationship change that didn't commit, so
    // there is never a misleading audit record for a lost race.
    expect(tx.auditLogEntry.create).not.toHaveBeenCalled();
  });

  it("never creates a Customer: the narrow tx client has no customer.create at all", () => {
    const tx = makeAcceptTx();
    expect("create" in tx.customer).toBe(false);
  });
});

describe("sellerDeclineRequestInTx", () => {
  it("sets the relationship to DECLINED and writes exactly one audit entry", async () => {
    const tx = makeDeclineTx();
    const relationship = relationshipRow();

    const result = await sellerDeclineRequestInTx(tx, SELLER_ACTOR_ID, relationship);

    expect(result.outcome).toBe("declined");
    expect(result.relationship.status).toBe("DECLINED");
    expect(result.relationship.respondedByUserId).toBe(SELLER_ACTOR_ID);
    expect(tx.tradingRelationship.updateMany).toHaveBeenCalledWith({
      where: { id: relationship.id, status: "PENDING" },
      data: { status: "DECLINED", respondedByUserId: SELLER_ACTOR_ID, respondedAt: expect.any(Date) },
    });
    expect(tx.auditLogEntry.create).toHaveBeenCalledTimes(1);
  });

  it("never creates or changes a CustomerMembership: the narrow tx client has no such property at all", () => {
    const tx = makeDeclineTx();
    expect("customerMembership" in tx).toBe(false);
    expect("customer" in tx).toBe(false);
  });

  it("lost decline race: throws without writing a (duplicate) audit entry when the conditional update affects 0 rows", async () => {
    const tx = makeDeclineTx({ tradingRelationship: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } });

    await expect(sellerDeclineRequestInTx(tx, SELLER_ACTOR_ID, relationshipRow())).rejects.toThrow(
      RelationshipAlreadyRespondedError
    );
    expect(tx.auditLogEntry.create).not.toHaveBeenCalled();
  });
});
