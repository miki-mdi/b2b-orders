// Pure unit tests against a fully mocked tx client - no DATABASE_URL, no
// local dev database, no Railway, no network at all. Same style as
// tests/bootstrap/pilot-buyer-service.test.ts: inviteBuyerForCustomerInTx
// only ever calls the methods on TradingRelationshipTxClient, so a plain
// vi.fn() fake satisfies the whole interface.
import { describe, expect, it, vi } from "vitest";
import { Prisma, type TradingRelationship } from "@prisma/client";
import {
  CustomerNotFoundError,
  RelationshipAlreadyActiveError,
  RelationshipCustomerConflictError,
  TargetUserInactiveError,
  TargetUserNotFoundError,
  inviteBuyerForCustomerInTx,
  type TradingRelationshipTxClient,
} from "@/lib/domain/trading-relationships/trading-relationship-service";

const TENANT_ID = "tenant-1";
const ACTOR_USER_ID = "seller-staff-1";
const CUSTOMER_ID = "customer-1";
const TARGET_USER_ID = "buyer-user-1";
const EMAIL = "buyer@example.test";

function relationshipRow(overrides: Partial<TradingRelationship> = {}): TradingRelationship {
  return {
    id: "relationship-1",
    tenantId: TENANT_ID,
    userId: TARGET_USER_ID,
    customerId: CUSTOMER_ID,
    status: "PENDING",
    initiatedBy: "SELLER",
    initiatedByUserId: ACTOR_USER_ID,
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
  customer?: Partial<TradingRelationshipTxClient["customer"]>;
  user?: Partial<TradingRelationshipTxClient["user"]>;
  tradingRelationship?: Partial<TradingRelationshipTxClient["tradingRelationship"]>;
  auditLogEntry?: Partial<TradingRelationshipTxClient["auditLogEntry"]>;
}): TradingRelationshipTxClient {
  return {
    customer: {
      findUnique: vi.fn().mockResolvedValue({ id: CUSTOMER_ID, isActive: true }),
      ...overrides?.customer,
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: TARGET_USER_ID, isActive: true }),
      ...overrides?.user,
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

describe("inviteBuyerForCustomerInTx", () => {
  it("rejects when the customer does not exist or is not active", async () => {
    const tx = makeTx({ customer: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(inviteBuyerForCustomerInTx(tx, TENANT_ID, ACTOR_USER_ID, CUSTOMER_ID, EMAIL)).rejects.toThrow(
      CustomerNotFoundError
    );

    const txInactive = makeTx({ customer: { findUnique: vi.fn().mockResolvedValue({ id: CUSTOMER_ID, isActive: false }) } });
    await expect(
      inviteBuyerForCustomerInTx(txInactive, TENANT_ID, ACTOR_USER_ID, CUSTOMER_ID, EMAIL)
    ).rejects.toThrow(CustomerNotFoundError);
  });

  it("rejects when no registered user exists for the email", async () => {
    const tx = makeTx({ user: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(inviteBuyerForCustomerInTx(tx, TENANT_ID, ACTOR_USER_ID, CUSTOMER_ID, EMAIL)).rejects.toThrow(
      TargetUserNotFoundError
    );
    expect(tx.tradingRelationship.create).not.toHaveBeenCalled();
  });

  it("rejects an inactive target user", async () => {
    const tx = makeTx({ user: { findUnique: vi.fn().mockResolvedValue({ id: TARGET_USER_ID, isActive: false }) } });
    await expect(inviteBuyerForCustomerInTx(tx, TENANT_ID, ACTOR_USER_ID, CUSTOMER_ID, EMAIL)).rejects.toThrow(
      TargetUserInactiveError
    );
    expect(tx.tradingRelationship.create).not.toHaveBeenCalled();
  });

  it("normalizes the email (trims and lowercases) before the lookup", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: TARGET_USER_ID, isActive: true });
    const tx = makeTx({ user: { findUnique } });
    await inviteBuyerForCustomerInTx(tx, TENANT_ID, ACTOR_USER_ID, CUSTOMER_ID, "  Buyer@Example.TEST  ");
    expect(findUnique).toHaveBeenCalledWith({ where: { email: "buyer@example.test" }, select: { id: true, isActive: true } });
  });

  it("creates a new PENDING relationship when none exists", async () => {
    const tx = makeTx();
    const result = await inviteBuyerForCustomerInTx(tx, TENANT_ID, ACTOR_USER_ID, CUSTOMER_ID, EMAIL);

    expect(result.outcome).toBe("created");
    expect(result.relationship.status).toBe("PENDING");
    expect(tx.tradingRelationship.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        userId: TARGET_USER_ID,
        customerId: CUSTOMER_ID,
        status: "PENDING",
        initiatedBy: "SELLER",
        initiatedByUserId: ACTOR_USER_ID,
      },
    });
    expect(tx.auditLogEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLogEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "CREATE", entityType: "TradingRelationship" }) })
    );
  });

  it("is idempotent: returns the existing row for an already-PENDING relationship without writing anything", async () => {
    const existing = relationshipRow({ status: "PENDING" });
    const tx = makeTx({ tradingRelationship: { findUnique: vi.fn().mockResolvedValue(existing) } });

    const result = await inviteBuyerForCustomerInTx(tx, TENANT_ID, ACTOR_USER_ID, CUSTOMER_ID, EMAIL);

    expect(result).toEqual({ outcome: "already-pending", relationship: existing });
    expect(tx.tradingRelationship.create).not.toHaveBeenCalled();
    expect(tx.tradingRelationship.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLogEntry.create).not.toHaveBeenCalled();
  });

  it("rejects an existing ACTIVE relationship", async () => {
    const existing = relationshipRow({ status: "ACTIVE" });
    const tx = makeTx({ tradingRelationship: { findUnique: vi.fn().mockResolvedValue(existing) } });

    await expect(inviteBuyerForCustomerInTx(tx, TENANT_ID, ACTOR_USER_ID, CUSTOMER_ID, EMAIL)).rejects.toThrow(
      RelationshipAlreadyActiveError
    );
    expect(tx.tradingRelationship.updateMany).not.toHaveBeenCalled();
  });

  it.each(["DECLINED", "REVOKED"] as const)(
    "reuses the row and resets it back to PENDING when the existing relationship is %s",
    async (status) => {
      const existing = relationshipRow({
        status,
        respondedByUserId: "buyer-user-1",
        respondedAt: new Date("2026-01-02T00:00:00.000Z"),
        revokedByUserId: status === "REVOKED" ? "buyer-user-1" : null,
        revokedAt: status === "REVOKED" ? new Date("2026-01-03T00:00:00.000Z") : null,
      });
      const tx = makeTx({ tradingRelationship: { findUnique: vi.fn().mockResolvedValue(existing) } });

      const result = await inviteBuyerForCustomerInTx(tx, TENANT_ID, ACTOR_USER_ID, CUSTOMER_ID, EMAIL);

      expect(result.outcome).toBe("reinvited");
      expect(result.relationship.status).toBe("PENDING");
      expect(result.relationship.respondedByUserId).toBeNull();
      expect(result.relationship.respondedAt).toBeNull();
      expect(result.relationship.revokedByUserId).toBeNull();
      expect(result.relationship.revokedAt).toBeNull();
      expect(result.relationship.initiatedBy).toBe("SELLER");
      expect(result.relationship.initiatedByUserId).toBe(ACTOR_USER_ID);

      expect(tx.tradingRelationship.updateMany).toHaveBeenCalledWith({
        where: { id: existing.id, status },
        data: expect.objectContaining({ status: "PENDING", customerId: CUSTOMER_ID }),
      });
      expect(tx.tradingRelationship.create).not.toHaveBeenCalled();
      expect(tx.auditLogEntry.create).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["PENDING", "DECLINED", "REVOKED"] as const)(
    "rejects with a safe error, and does not relink, when an existing %s relationship is linked to a different customer",
    async (status) => {
      const existing = relationshipRow({ status, customerId: "a-different-customer" });
      const tx = makeTx({ tradingRelationship: { findUnique: vi.fn().mockResolvedValue(existing) } });

      await expect(inviteBuyerForCustomerInTx(tx, TENANT_ID, ACTOR_USER_ID, CUSTOMER_ID, EMAIL)).rejects.toThrow(
        RelationshipCustomerConflictError
      );
      expect(tx.tradingRelationship.updateMany).not.toHaveBeenCalled();
      expect(tx.auditLogEntry.create).not.toHaveBeenCalled();
    }
  );

  it("handles the unique-constraint race on create: re-reads and responds idempotently instead of throwing", async () => {
    const raced = relationshipRow({ status: "PENDING" });
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null) // initial check: nothing exists yet
      .mockResolvedValueOnce(raced); // re-read after the unique violation: someone else won the race
    const create = vi
      .fn()
      .mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }));

    const tx = makeTx({ tradingRelationship: { findUnique, create } });

    const result = await inviteBuyerForCustomerInTx(tx, TENANT_ID, ACTOR_USER_ID, CUSTOMER_ID, EMAIL);

    expect(result).toEqual({ outcome: "already-pending", relationship: raced });
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("handles the unique-constraint race on create when the racing row conflicts with a different customer", async () => {
    const raced = relationshipRow({ status: "PENDING", customerId: "a-different-customer" });
    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(raced);
    const create = vi
      .fn()
      .mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }));

    const tx = makeTx({ tradingRelationship: { findUnique, create } });

    await expect(inviteBuyerForCustomerInTx(tx, TENANT_ID, ACTOR_USER_ID, CUSTOMER_ID, EMAIL)).rejects.toThrow(
      RelationshipCustomerConflictError
    );
  });

  it("re-resolves against the fresh row when a concurrent re-invite wins the conditional update race", async () => {
    const existing = relationshipRow({ status: "DECLINED" });
    const wonByOther = relationshipRow({ status: "PENDING" }); // another caller's re-invite already applied
    const findUnique = vi.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(wonByOther);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    const tx = makeTx({ tradingRelationship: { findUnique, updateMany } });

    const result = await inviteBuyerForCustomerInTx(tx, TENANT_ID, ACTOR_USER_ID, CUSTOMER_ID, EMAIL);

    expect(result).toEqual({ outcome: "already-pending", relationship: wonByOther });
    expect(tx.auditLogEntry.create).not.toHaveBeenCalled();
  });

  it("propagates a non-unique-constraint error from create unchanged", async () => {
    const boom = new Error("some other database error");
    const tx = makeTx({ tradingRelationship: { create: vi.fn().mockRejectedValue(boom) } });

    await expect(inviteBuyerForCustomerInTx(tx, TENANT_ID, ACTOR_USER_ID, CUSTOMER_ID, EMAIL)).rejects.toThrow(boom);
  });
});
