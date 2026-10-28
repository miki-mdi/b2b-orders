// Pure unit tests against a fully mocked tx client - no DATABASE_URL, no
// local dev database, no Railway, no network at all. Same style as
// trading-relationship-service.test.ts (Phase 2) and
// trading-relationship-accept-decline.test.ts (Phase 3).
import { describe, expect, it, vi } from "vitest";
import { Prisma, type TradingRelationship } from "@prisma/client";
import {
  RelationshipAlreadyActiveError,
  TargetTenantUnavailableError,
  requestConnectionInTx,
  type RequestConnectionTxClient,
} from "@/lib/domain/trading-relationships/trading-relationship-service";

const TENANT_ID = "tenant-1";
const BUYER_USER_ID = "buyer-user-1";

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

function makeTx(overrides?: {
  tenant?: Partial<RequestConnectionTxClient["tenant"]>;
  tradingRelationship?: Partial<RequestConnectionTxClient["tradingRelationship"]>;
  auditLogEntry?: Partial<RequestConnectionTxClient["auditLogEntry"]>;
}): RequestConnectionTxClient {
  return {
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ id: TENANT_ID, status: "ACTIVE" }),
      ...overrides?.tenant,
    },
    tradingRelationship: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(relationshipRow({ id: "relationship-new", ...data }))),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides?.tradingRelationship,
    },
    auditLogEntry: {
      create: vi.fn().mockResolvedValue({}),
      ...overrides?.auditLogEntry,
    },
  };
}

describe("requestConnectionInTx", () => {
  it("request to an active seller creates exactly one PENDING, BUYER-initiated relationship with no customer", async () => {
    const tx = makeTx();

    const result = await requestConnectionInTx(tx, BUYER_USER_ID, TENANT_ID);

    expect(result.outcome).toBe("created");
    expect(result.relationship.status).toBe("PENDING");
    expect(result.relationship.initiatedBy).toBe("BUYER");
    expect(result.relationship.customerId).toBeNull();
    expect(tx.tradingRelationship.create).toHaveBeenCalledTimes(1);
    expect(tx.tradingRelationship.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        userId: BUYER_USER_ID,
        customerId: null,
        status: "PENDING",
        initiatedBy: "BUYER",
        initiatedByUserId: BUYER_USER_ID,
      },
    });
    expect(tx.auditLogEntry.create).toHaveBeenCalledTimes(1);
  });

  it("rejects when the target tenant does not exist", async () => {
    const tx = makeTx({ tenant: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(requestConnectionInTx(tx, BUYER_USER_ID, TENANT_ID)).rejects.toThrow(TargetTenantUnavailableError);
    expect(tx.tradingRelationship.create).not.toHaveBeenCalled();
  });

  it("rejects when the target tenant is suspended", async () => {
    const tx = makeTx({ tenant: { findUnique: vi.fn().mockResolvedValue({ id: TENANT_ID, status: "SUSPENDED" }) } });
    await expect(requestConnectionInTx(tx, BUYER_USER_ID, TENANT_ID)).rejects.toThrow(TargetTenantUnavailableError);
    expect(tx.tradingRelationship.create).not.toHaveBeenCalled();
  });

  it("is idempotent: returns the existing row for an already-PENDING relationship without writing anything", async () => {
    const existing = relationshipRow({ status: "PENDING" });
    const tx = makeTx({ tradingRelationship: { findUnique: vi.fn().mockResolvedValue(existing) } });

    const result = await requestConnectionInTx(tx, BUYER_USER_ID, TENANT_ID);

    expect(result).toEqual({ outcome: "already-pending", relationship: existing });
    expect(tx.tradingRelationship.create).not.toHaveBeenCalled();
    expect(tx.tradingRelationship.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLogEntry.create).not.toHaveBeenCalled();
  });

  it("rejects an existing ACTIVE relationship", async () => {
    const existing = relationshipRow({ status: "ACTIVE" });
    const tx = makeTx({ tradingRelationship: { findUnique: vi.fn().mockResolvedValue(existing) } });

    await expect(requestConnectionInTx(tx, BUYER_USER_ID, TENANT_ID)).rejects.toThrow(RelationshipAlreadyActiveError);
    expect(tx.tradingRelationship.updateMany).not.toHaveBeenCalled();
  });

  it.each(["DECLINED", "REVOKED"] as const)(
    "re-requests after %s: resets to PENDING, sets BUYER as initiator, preserves customerId, writes audit",
    async (status) => {
      const existing = relationshipRow({
        status,
        customerId: "a-customer-from-an-earlier-seller-invite",
        initiatedBy: "SELLER",
        initiatedByUserId: "seller-staff-1",
        respondedByUserId: BUYER_USER_ID,
        respondedAt: new Date("2026-01-02T00:00:00.000Z"),
        revokedByUserId: status === "REVOKED" ? BUYER_USER_ID : null,
        revokedAt: status === "REVOKED" ? new Date("2026-01-03T00:00:00.000Z") : null,
      });
      const tx = makeTx({ tradingRelationship: { findUnique: vi.fn().mockResolvedValue(existing) } });

      const result = await requestConnectionInTx(tx, BUYER_USER_ID, TENANT_ID);

      expect(result.outcome).toBe("re-requested");
      expect(result.relationship.status).toBe("PENDING");
      expect(result.relationship.initiatedBy).toBe("BUYER");
      expect(result.relationship.initiatedByUserId).toBe(BUYER_USER_ID);
      expect(result.relationship.respondedByUserId).toBeNull();
      expect(result.relationship.respondedAt).toBeNull();
      expect(result.relationship.revokedByUserId).toBeNull();
      expect(result.relationship.revokedAt).toBeNull();
      // customerId is preserved untouched, unlike a seller's re-invite which sets it.
      expect(result.relationship.customerId).toBe("a-customer-from-an-earlier-seller-invite");

      expect(tx.tradingRelationship.updateMany).toHaveBeenCalledWith({
        where: { id: existing.id, status },
        data: expect.objectContaining({ status: "PENDING", initiatedBy: "BUYER", initiatedByUserId: BUYER_USER_ID }),
      });
      // The conditional update's own `data` must never mention customerId at all.
      const updateCall = (tx.tradingRelationship.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty("customerId");
      expect(tx.tradingRelationship.create).not.toHaveBeenCalled();
      expect(tx.auditLogEntry.create).toHaveBeenCalledTimes(1);
    }
  );

  it("handles the unique-constraint race on create: re-reads and responds idempotently instead of throwing", async () => {
    const raced = relationshipRow({ status: "PENDING" });
    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(raced);
    const create = vi
      .fn()
      .mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }));

    const tx = makeTx({ tradingRelationship: { findUnique, create } });

    const result = await requestConnectionInTx(tx, BUYER_USER_ID, TENANT_ID);

    expect(result).toEqual({ outcome: "already-pending", relationship: raced });
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("re-resolves against the fresh row when a concurrent re-request wins the conditional update race", async () => {
    const existing = relationshipRow({ status: "DECLINED" });
    const wonByOther = relationshipRow({ status: "PENDING" });
    const findUnique = vi.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(wonByOther);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    const tx = makeTx({ tradingRelationship: { findUnique, updateMany } });

    const result = await requestConnectionInTx(tx, BUYER_USER_ID, TENANT_ID);

    expect(result).toEqual({ outcome: "already-pending", relationship: wonByOther });
    expect(tx.auditLogEntry.create).not.toHaveBeenCalled();
  });

  it("propagates a non-unique-constraint error from create unchanged", async () => {
    const boom = new Error("some other database error");
    const tx = makeTx({ tradingRelationship: { create: vi.fn().mockRejectedValue(boom) } });

    await expect(requestConnectionInTx(tx, BUYER_USER_ID, TENANT_ID)).rejects.toThrow(boom);
  });

  it("can never discover or reuse another user's relationship: the lookup is always keyed by the caller's own userId", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const tx = makeTx({ tradingRelationship: { findUnique } });

    await requestConnectionInTx(tx, BUYER_USER_ID, TENANT_ID);

    for (const call of findUnique.mock.calls) {
      expect(call[0].where.userId_tenantId.userId).toBe(BUYER_USER_ID);
    }
  });

  it("never writes Customer or CustomerMembership: the narrow tx client has no such properties at all", () => {
    const tx = makeTx();
    expect("customer" in tx).toBe(false);
    expect("customerMembership" in tx).toBe(false);
  });
});
