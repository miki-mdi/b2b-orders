import type { CustomerMembership, Prisma, RelationshipInitiator, RelationshipStatus, TradingRelationship } from "@prisma/client";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { withUserContext } from "@/lib/db/with-user-context";
import { isUniqueConstraintError } from "@/lib/domain/shared/errors";

/**
 * Cross-seller relationship feature (see docs/SESSION_HANDOFF.md's design
 * note).
 *
 * Phase 2 (seller-initiated invitations) only ever writes PENDING rows and
 * never touches CustomerMembership. Phase 3 (buyer accept/decline, below)
 * is the first code that creates/reactivates CustomerMembership - and only
 * ever for the CALLER's own userId, discovered through their own self-row
 * access, never for anyone else's. Buyer-initiated requests, the seller
 * switcher, cookie storage, and revocation remain out of scope.
 *
 * inviteBuyerForCustomerInTx/acceptInvitationInTx/declineInvitationInTx
 * each take a narrow, structurally-typed tx client (not the real
 * ScopedTransactionClient) specifically so they can be unit tested with a
 * plain vi.fn() mock and no database connection at all - the same style
 * already used by src/lib/bootstrap/pilot-buyer-service.ts for exactly
 * this reason. The real ScopedTransactionClient satisfies each interface
 * structurally, so the withTenantContext-wrapped entry points below pass
 * their tx straight through with no adapter needed.
 */
export type TradingRelationshipTxClient = {
  customer: {
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string; isActive: boolean } | null>;
  };
  user: {
    findUnique: (args: {
      where: { email: string };
      select: { id: true; isActive: true };
    }) => Promise<{ id: string; isActive: boolean } | null>;
  };
  tradingRelationship: {
    findUnique: (args: {
      where: { userId_tenantId: { userId: string; tenantId: string } };
    }) => Promise<TradingRelationship | null>;
    create: (args: {
      data: {
        tenantId: string;
        userId: string;
        customerId: string;
        status: RelationshipStatus;
        initiatedBy: RelationshipInitiator;
        initiatedByUserId: string;
      };
    }) => Promise<TradingRelationship>;
    updateMany: (args: {
      where: { id: string; status: RelationshipStatus };
      data: {
        status: RelationshipStatus;
        customerId: string;
        initiatedBy: RelationshipInitiator;
        initiatedByUserId: string;
        respondedByUserId: null;
        respondedAt: null;
        revokedByUserId: null;
        revokedAt: null;
      };
    }) => Promise<{ count: number }>;
  };
  auditLogEntry: {
    create: (args: { data: Prisma.AuditLogEntryUncheckedCreateInput }) => Promise<unknown>;
  };
};

export class CustomerNotFoundError extends Error {}
export class TargetUserNotFoundError extends Error {}
export class TargetUserInactiveError extends Error {}
export class RelationshipAlreadyActiveError extends Error {}
export class RelationshipCustomerConflictError extends Error {}

// Phase 3 (buyer accept/decline) errors.
export class RelationshipNotFoundError extends Error {}
export class RelationshipNotRespondableError extends Error {}
export class RelationshipCustomerUnavailableError extends Error {}
export class RelationshipAlreadyRespondedError extends Error {}

export type InviteBuyerOutcome = "created" | "already-pending" | "reinvited";
export type InviteBuyerResult = { outcome: InviteBuyerOutcome; relationship: TradingRelationship };

/** The minimal shape every narrow tx-client interface in this file shares, just for the audit write. */
type AuditWritableTxClient = {
  auditLogEntry: { create: (args: { data: Prisma.AuditLogEntryUncheckedCreateInput }) => Promise<unknown> };
};

function writeRelationshipAuditEntry(
  tx: AuditWritableTxClient,
  params: {
    tenantId: string;
    actorUserId: string;
    entityType: "TradingRelationship" | "CustomerMembership";
    entityId: string;
    action: "CREATE" | "UPDATE" | "REACTIVATE" | "DEACTIVATE";
    oldValue?: unknown;
    newValue: unknown;
    reason: string;
  }
) {
  return tx.auditLogEntry.create({
    data: {
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      actingContext: "TENANT",
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      oldValue: params.oldValue !== undefined ? JSON.stringify(params.oldValue) : null,
      newValue: JSON.stringify(params.newValue),
      reason: params.reason,
    },
  });
}

/**
 * DECLINED/REVOKED -> PENDING, reusing the same row (never a second insert -
 * @@unique([userId, tenantId]) only allows one row per buyer/seller pair).
 * The update is conditional on the status this caller actually observed
 * (`existing.status`), so a concurrent re-invite attempt on the same row
 * can't silently double-apply - exactly one of two racing callers gets
 * count: 1, the other falls through to re-read-and-resolve.
 */
async function reinvite(
  tx: TradingRelationshipTxClient,
  tenantId: string,
  actorUserId: string,
  customerId: string,
  targetUserId: string,
  existing: TradingRelationship
): Promise<InviteBuyerResult> {
  const result = await tx.tradingRelationship.updateMany({
    where: { id: existing.id, status: existing.status },
    data: {
      status: "PENDING",
      customerId,
      initiatedBy: "SELLER",
      initiatedByUserId: actorUserId,
      respondedByUserId: null,
      respondedAt: null,
      revokedByUserId: null,
      revokedAt: null,
    },
  });

  if (result.count === 0) {
    // Someone else changed this row between our read and our write (e.g. a
    // concurrent re-invite won the race first). Re-read and resolve against
    // its actual current state rather than assuming our transition applied.
    const fresh = await tx.tradingRelationship.findUnique({
      where: { userId_tenantId: { userId: targetUserId, tenantId } },
    });
    if (!fresh) {
      throw new Error("The trading relationship was unexpectedly removed while re-inviting this buyer.");
    }
    return resolveExisting(tx, tenantId, actorUserId, customerId, targetUserId, fresh);
  }

  const updated: TradingRelationship = {
    ...existing,
    status: "PENDING",
    customerId,
    initiatedBy: "SELLER",
    initiatedByUserId: actorUserId,
    respondedByUserId: null,
    respondedAt: null,
    revokedByUserId: null,
    revokedAt: null,
  };

  await writeRelationshipAuditEntry(tx, {
    tenantId,
    actorUserId,
    entityType: "TradingRelationship",
    entityId: existing.id,
    action: "UPDATE",
    oldValue: existing,
    newValue: updated,
    reason: `Seller re-invited buyer after the relationship was ${existing.status}.`,
  });

  return { outcome: "reinvited", relationship: updated };
}

/** Decides what to do with an already-existing row for this (userId, tenantId) pair. */
async function resolveExisting(
  tx: TradingRelationshipTxClient,
  tenantId: string,
  actorUserId: string,
  customerId: string,
  targetUserId: string,
  existing: TradingRelationship
): Promise<InviteBuyerResult> {
  if (existing.status === "ACTIVE") {
    throw new RelationshipAlreadyActiveError("This buyer is already connected to this seller.");
  }

  // Applies to PENDING/DECLINED/REVOKED alike: a relationship already tied
  // to a different Customer is never silently relinked to this one.
  if (existing.customerId && existing.customerId !== customerId) {
    throw new RelationshipCustomerConflictError(
      "This buyer already has a relationship with your company linked to a different customer record. " +
        "Resolve that relationship before inviting them for this customer."
    );
  }

  if (existing.status === "PENDING") {
    return { outcome: "already-pending", relationship: existing };
  }

  return reinvite(tx, tenantId, actorUserId, customerId, targetUserId, existing);
}

/**
 * Core decision logic, testable without a database (see the module comment).
 * Always call this from inside withTenantContext(tenantId, ...) - see
 * inviteBuyerForCustomer below for the real entry point.
 */
export async function inviteBuyerForCustomerInTx(
  tx: TradingRelationshipTxClient,
  tenantId: string,
  actorUserId: string,
  customerId: string,
  rawEmail: string
): Promise<InviteBuyerResult> {
  const email = rawEmail.trim().toLowerCase();

  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer || !customer.isActive) {
    throw new CustomerNotFoundError("This customer could not be found or is not active.");
  }

  const targetUser = await tx.user.findUnique({
    where: { email },
    select: { id: true, isActive: true },
  });
  if (!targetUser) {
    throw new TargetUserNotFoundError("No registered buyer account was found for this email address.");
  }
  if (!targetUser.isActive) {
    throw new TargetUserInactiveError("This buyer account is not active.");
  }

  const existing = await tx.tradingRelationship.findUnique({
    where: { userId_tenantId: { userId: targetUser.id, tenantId } },
  });

  if (existing) {
    return resolveExisting(tx, tenantId, actorUserId, customerId, targetUser.id, existing);
  }

  try {
    const created = await tx.tradingRelationship.create({
      data: {
        tenantId,
        userId: targetUser.id,
        customerId,
        status: "PENDING",
        initiatedBy: "SELLER",
        initiatedByUserId: actorUserId,
      },
    });
    await writeRelationshipAuditEntry(tx, {
      tenantId,
      actorUserId,
      entityType: "TradingRelationship",
      entityId: created.id,
      action: "CREATE",
      newValue: created,
      reason: `Seller invited buyer (${email}).`,
    });
    return { outcome: "created", relationship: created };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    // Another request created the row for this (userId, tenantId) pair
    // between our findUnique above and this insert. Re-read and resolve
    // against what's actually there now instead of surfacing a raw
    // constraint-violation error.
    const raced = await tx.tradingRelationship.findUnique({
      where: { userId_tenantId: { userId: targetUser.id, tenantId } },
    });
    if (!raced) throw error;
    return resolveExisting(tx, tenantId, actorUserId, customerId, targetUser.id, raced);
  }
}

export function inviteBuyerForCustomer(
  tenantId: string,
  actorUserId: string,
  customerId: string,
  rawEmail: string
): Promise<InviteBuyerResult> {
  return withTenantContext(tenantId, (tx) =>
    inviteBuyerForCustomerInTx(tx, tenantId, actorUserId, customerId, rawEmail)
  );
}

export function listTradingRelationshipsForCustomer(tenantId: string, customerId: string) {
  return withTenantContext(tenantId, (tx) =>
    tx.tradingRelationship.findMany({
      where: { customerId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "desc" },
    })
  );
}

// ---------------------------------------------------------------------------
// Phase 3: buyer accept/decline of a seller-initiated invitation.
// ---------------------------------------------------------------------------

export type AcceptInvitationTxClient = {
  customer: {
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string; tenantId: string; isActive: boolean } | null>;
  };
  customerMembership: {
    findUnique: (args: {
      where: { userId_customerId: { userId: string; customerId: string } };
    }) => Promise<{ id: string; isActive: boolean } | null>;
    create: (args: {
      data: { userId: string; customerId: string; tenantId: string; role: "BUYER_ADMIN" };
    }) => Promise<Pick<CustomerMembership, "id">>;
    update: (args: { where: { id: string }; data: { isActive: true } }) => Promise<Pick<CustomerMembership, "id">>;
  };
  tradingRelationship: {
    updateMany: (args: {
      where: { id: string; status: "PENDING" };
      data: { status: "ACTIVE"; respondedByUserId: string; respondedAt: Date };
    }) => Promise<{ count: number }>;
  };
  auditLogEntry: AuditWritableTxClient["auditLogEntry"];
};

export type DeclineInvitationTxClient = {
  tradingRelationship: {
    updateMany: (args: {
      where: { id: string; status: "PENDING" };
      data: { status: "DECLINED"; respondedByUserId: string; respondedAt: Date };
    }) => Promise<{ count: number }>;
  };
  auditLogEntry: AuditWritableTxClient["auditLogEntry"];
};

export type AcceptInvitationResult = {
  outcome: "activated";
  relationship: TradingRelationship;
  membershipId: string;
  membershipAction: "created" | "reactivated";
};
export type DeclineInvitationResult = { outcome: "declined"; relationship: TradingRelationship };

/**
 * Core accept logic, testable without a database (see the module comment).
 * `relationship` must already be verified PENDING/SELLER-initiated AND
 * owned by `actorUserId` by the caller (see acceptInvitation below) -
 * this function trusts it was. Always call from inside
 * withTenantContext(relationship.tenantId, ...).
 */
export async function acceptInvitationInTx(
  tx: AcceptInvitationTxClient,
  actorUserId: string,
  relationship: TradingRelationship
): Promise<AcceptInvitationResult> {
  if (!relationship.customerId) {
    throw new RelationshipCustomerUnavailableError("This invitation is not linked to a customer yet.");
  }

  const customer = await tx.customer.findUnique({ where: { id: relationship.customerId } });
  if (!customer || !customer.isActive || customer.tenantId !== relationship.tenantId) {
    throw new RelationshipCustomerUnavailableError("The linked customer is no longer available.");
  }

  const existingMembership = await tx.customerMembership.findUnique({
    where: { userId_customerId: { userId: relationship.userId, customerId: relationship.customerId } },
  });

  let membershipId: string;
  let membershipAction: "created" | "reactivated";
  if (existingMembership) {
    if (!existingMembership.isActive) {
      await tx.customerMembership.update({ where: { id: existingMembership.id }, data: { isActive: true } });
    }
    membershipId = existingMembership.id;
    membershipAction = "reactivated";
  } else {
    const created = await tx.customerMembership.create({
      data: {
        userId: relationship.userId,
        customerId: relationship.customerId,
        tenantId: relationship.tenantId,
        role: "BUYER_ADMIN",
      },
    });
    membershipId = created.id;
    membershipAction = "created";
  }

  const respondedAt = new Date();
  const result = await tx.tradingRelationship.updateMany({
    where: { id: relationship.id, status: "PENDING" },
    data: { status: "ACTIVE", respondedByUserId: actorUserId, respondedAt },
  });

  if (result.count === 0) {
    // Someone else already responded (e.g. a second tab's click won the
    // race first). The membership write above happened in THIS SAME
    // database transaction - withTenantContext wraps this whole function
    // in one prisma.$transaction (src/lib/db/with-tenant.ts), which only
    // commits once the callback resolves without throwing. Throwing here
    // rolls the entire transaction back, including the membership
    // create/reactivate, so no CustomerMembership is left behind for a
    // relationship that didn't actually end up ACTIVE.
    throw new RelationshipAlreadyRespondedError("This invitation has already been responded to.");
  }

  await writeRelationshipAuditEntry(tx, {
    tenantId: relationship.tenantId,
    actorUserId,
    entityType: "CustomerMembership",
    entityId: membershipId,
    action: membershipAction === "created" ? "CREATE" : "REACTIVATE",
    newValue: { userId: relationship.userId, customerId: relationship.customerId, tenantId: relationship.tenantId },
    reason: `Buyer accepted trading relationship ${relationship.id}.`,
  });

  const updatedRelationship: TradingRelationship = {
    ...relationship,
    status: "ACTIVE",
    respondedByUserId: actorUserId,
    respondedAt,
  };

  await writeRelationshipAuditEntry(tx, {
    tenantId: relationship.tenantId,
    actorUserId,
    entityType: "TradingRelationship",
    entityId: relationship.id,
    action: "UPDATE",
    oldValue: relationship,
    newValue: updatedRelationship,
    reason: "Buyer accepted the invitation.",
  });

  return { outcome: "activated", relationship: updatedRelationship, membershipId, membershipAction };
}

/** Core decline logic, testable without a database - same preconditions as acceptInvitationInTx above. */
export async function declineInvitationInTx(
  tx: DeclineInvitationTxClient,
  actorUserId: string,
  relationship: TradingRelationship
): Promise<DeclineInvitationResult> {
  const respondedAt = new Date();
  const result = await tx.tradingRelationship.updateMany({
    where: { id: relationship.id, status: "PENDING" },
    data: { status: "DECLINED", respondedByUserId: actorUserId, respondedAt },
  });

  if (result.count === 0) {
    throw new RelationshipAlreadyRespondedError("This invitation has already been responded to.");
  }

  const updatedRelationship: TradingRelationship = {
    ...relationship,
    status: "DECLINED",
    respondedByUserId: actorUserId,
    respondedAt,
  };

  await writeRelationshipAuditEntry(tx, {
    tenantId: relationship.tenantId,
    actorUserId,
    entityType: "TradingRelationship",
    entityId: relationship.id,
    action: "UPDATE",
    oldValue: relationship,
    newValue: updatedRelationship,
    reason: "Buyer declined the invitation.",
  });

  return { outcome: "declined", relationship: updatedRelationship };
}

/**
 * Pure validation, deliberately split out from discoverOwnPendingSellerInvitation
 * below so it's unit-testable without a database: given whatever row (or
 * null) a lookup produced, decides whether `callerUserId` may accept/decline
 * it. The ownership check here is defense-in-depth on top of RLS, which
 * already makes another user's relationship invisible to the self-row
 * lookup that normally feeds this - matching this codebase's existing "the
 * domain layer re-checks, not just the access path" convention (see
 * customer-service.ts's updateCustomerContactInfo). A relationship
 * belonging to a different user is NEVER accepted/declined through this
 * path, by construction.
 */
export function assertOwnPendingSellerInvitation(
  relationship: TradingRelationship | null,
  callerUserId: string
): TradingRelationship {
  if (!relationship || relationship.userId !== callerUserId) {
    throw new RelationshipNotFoundError("This invitation could not be found.");
  }
  if (relationship.status !== "PENDING" || relationship.initiatedBy !== "SELLER") {
    throw new RelationshipNotRespondableError("This invitation can no longer be responded to.");
  }
  return relationship;
}

/** Finds `relationshipId` through the CALLER's own self-row RLS access (withUserContext) and validates it - see assertOwnPendingSellerInvitation above. */
async function discoverOwnPendingSellerInvitation(
  callerUserId: string,
  relationshipId: string
): Promise<TradingRelationship> {
  const relationship = await withUserContext(callerUserId, (tx) =>
    tx.tradingRelationship.findUnique({ where: { id: relationshipId } })
  );
  return assertOwnPendingSellerInvitation(relationship, callerUserId);
}

export async function acceptInvitation(callerUserId: string, relationshipId: string): Promise<AcceptInvitationResult> {
  const relationship = await discoverOwnPendingSellerInvitation(callerUserId, relationshipId);
  return withTenantContext(relationship.tenantId, (tx) => acceptInvitationInTx(tx, callerUserId, relationship));
}

export async function declineInvitation(callerUserId: string, relationshipId: string): Promise<DeclineInvitationResult> {
  const relationship = await discoverOwnPendingSellerInvitation(callerUserId, relationshipId);
  return withTenantContext(relationship.tenantId, (tx) => declineInvitationInTx(tx, callerUserId, relationship));
}

export type PendingSellerInvitation = TradingRelationship & {
  tenant: { name: string };
  customerName: string | null;
};

/**
 * Lists the caller's own PENDING, seller-initiated invitations across every
 * tenant, via the same self-row RLS exemption discoverOwnPendingSellerInvitation
 * uses. Tenant carries no RLS at all, so it's safely nested in the first
 * query - but Customer DOES carry RLS with no userId-based exemption, so a
 * nested `customer: true` include here would be silently blocked under
 * withUserContext's bare app.current_user_id context (see
 * src/lib/auth/active-membership.ts's own comment on this exact
 * limitation). Each customer name is therefore fetched with its own
 * withTenantContext call instead. Sequential, not Promise.all - concurrent
 * transactions were observed (src/lib/domain/admin/admin-service.ts) to
 * intermittently starve the local dev Postgres connection pool.
 */
export async function listPendingSellerInvitationsForUser(userId: string): Promise<PendingSellerInvitation[]> {
  const relationships = await withUserContext(userId, (tx) =>
    tx.tradingRelationship.findMany({
      where: { userId, status: "PENDING", initiatedBy: "SELLER" },
      include: { tenant: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    })
  );

  const results: PendingSellerInvitation[] = [];
  for (const relationship of relationships) {
    let customerName: string | null = null;
    if (relationship.customerId) {
      const customer = await withTenantContext(relationship.tenantId, (tx) =>
        tx.customer.findUnique({ where: { id: relationship.customerId! }, select: { name: true } })
      );
      customerName = customer?.name ?? null;
    }
    results.push({ ...relationship, customerName });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Phase 4: buyer-initiated connection requests.
// ---------------------------------------------------------------------------

export type ActiveSellerDirectoryEntry = { id: string; name: string };

/**
 * Read-only directory of active sellers a buyer can request a connection
 * with, for the "Find sellers" section of /[locale]/connections. Tenant
 * carries no RLS at all (platform-level, not tenant-owned data - see
 * prisma/rls/policies.sql's own "Deliberately NOT RLS-protected" section),
 * so a direct prismaBase read is the established, safe pattern - same as
 * the home page's membership-type check. Deliberately selects ONLY `id`/
 * `name`: no VAT id, no counts, no contact info, no other Tenant column -
 * `id` exists purely so the UI can bind it into a Server Action, never to
 * be rendered as visible text.
 */
export function listActiveSellerTenants(searchQuery?: string): Promise<ActiveSellerDirectoryEntry[]> {
  const trimmed = searchQuery?.trim();
  return prismaBase.tenant.findMany({
    where: {
      status: "ACTIVE",
      ...(trimmed ? { name: { contains: trimmed, mode: "insensitive" } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Every TradingRelationship (any status, any initiator) the caller holds,
 * keyed by tenantId - lets the "Find sellers" list show the correct status
 * per seller (already connected / request pending / free to request)
 * without an N+1 query per tenant. Same self-row RLS exemption as every
 * other "list my own relationships" function in this module.
 */
export async function listOwnRelationshipStatusByTenant(userId: string): Promise<Map<string, RelationshipStatus>> {
  const relationships = await withUserContext(userId, (tx) =>
    tx.tradingRelationship.findMany({ where: { userId }, select: { tenantId: true, status: true } })
  );
  return new Map(relationships.map((r) => [r.tenantId, r.status]));
}

export type RequestConnectionTxClient = {
  tenant: {
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string; status: "ACTIVE" | "SUSPENDED" } | null>;
  };
  tradingRelationship: {
    findUnique: (args: {
      where: { userId_tenantId: { userId: string; tenantId: string } };
    }) => Promise<TradingRelationship | null>;
    create: (args: {
      data: {
        tenantId: string;
        userId: string;
        customerId: null;
        status: "PENDING";
        initiatedBy: "BUYER";
        initiatedByUserId: string;
      };
    }) => Promise<TradingRelationship>;
    updateMany: (args: {
      where: { id: string; status: RelationshipStatus };
      data: {
        status: "PENDING";
        initiatedBy: "BUYER";
        initiatedByUserId: string;
        respondedByUserId: null;
        respondedAt: null;
        revokedByUserId: null;
        revokedAt: null;
      };
    }) => Promise<{ count: number }>;
  };
  auditLogEntry: AuditWritableTxClient["auditLogEntry"];
};

export class TargetTenantUnavailableError extends Error {}

export type RequestConnectionOutcome = "created" | "already-pending" | "re-requested";
export type RequestConnectionResult = { outcome: RequestConnectionOutcome; relationship: TradingRelationship };

/**
 * DECLINED/REVOKED -> PENDING, reusing the same row - same conditional-
 * update race-safety as reinvite() above, mirrored for the buyer direction.
 * Deliberately does NOT touch `customerId` at all: unlike a seller
 * re-inviting (which always knows and sets the Customer it means), a
 * buyer's re-request has no customer of its own to offer - whatever
 * customerId the row already has (null, or set from an earlier
 * seller-initiated invite that this same row once was) is preserved as-is.
 */
async function reRequestConnection(
  tx: RequestConnectionTxClient,
  actorUserId: string,
  existing: TradingRelationship
): Promise<RequestConnectionResult> {
  const result = await tx.tradingRelationship.updateMany({
    where: { id: existing.id, status: existing.status },
    data: {
      status: "PENDING",
      initiatedBy: "BUYER",
      initiatedByUserId: actorUserId,
      respondedByUserId: null,
      respondedAt: null,
      revokedByUserId: null,
      revokedAt: null,
    },
  });

  if (result.count === 0) {
    const fresh = await tx.tradingRelationship.findUnique({
      where: { userId_tenantId: { userId: existing.userId, tenantId: existing.tenantId } },
    });
    if (!fresh) {
      throw new Error("The trading relationship was unexpectedly removed while re-requesting it.");
    }
    return resolveExistingForRequest(tx, actorUserId, fresh);
  }

  const updated: TradingRelationship = {
    ...existing,
    status: "PENDING",
    initiatedBy: "BUYER",
    initiatedByUserId: actorUserId,
    respondedByUserId: null,
    respondedAt: null,
    revokedByUserId: null,
    revokedAt: null,
  };

  await writeRelationshipAuditEntry(tx, {
    tenantId: existing.tenantId,
    actorUserId,
    entityType: "TradingRelationship",
    entityId: existing.id,
    action: "UPDATE",
    oldValue: existing,
    newValue: updated,
    reason: `Buyer re-requested a connection after the relationship was ${existing.status}.`,
  });

  return { outcome: "re-requested", relationship: updated };
}

/** Decides what to do with an already-existing row for this (userId, tenantId) pair - buyer-request direction. */
function resolveExistingForRequest(
  tx: RequestConnectionTxClient,
  actorUserId: string,
  existing: TradingRelationship
): Promise<RequestConnectionResult> {
  if (existing.status === "ACTIVE") {
    throw new RelationshipAlreadyActiveError("You are already connected to this seller.");
  }
  if (existing.status === "PENDING") {
    return Promise.resolve({ outcome: "already-pending", relationship: existing });
  }
  return reRequestConnection(tx, actorUserId, existing);
}

/**
 * Core decision logic, testable without a database (see the module
 * comment). `actorUserId` is always the authenticated caller - never a
 * value from form input - so this can never create or alter a relationship
 * for anyone else, by construction: there is no userId parameter for a
 * caller to override. The narrow RequestConnectionTxClient above has no
 * `customer`/`customerMembership` property at all, so this function cannot
 * touch either table even by accident. Always call from inside
 * withTenantContext(tenantId, ...) - see requestConnection below.
 */
export async function requestConnectionInTx(
  tx: RequestConnectionTxClient,
  actorUserId: string,
  tenantId: string
): Promise<RequestConnectionResult> {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant || tenant.status !== "ACTIVE") {
    throw new TargetTenantUnavailableError("This seller is not available right now.");
  }

  const existing = await tx.tradingRelationship.findUnique({
    where: { userId_tenantId: { userId: actorUserId, tenantId } },
  });

  if (existing) {
    return resolveExistingForRequest(tx, actorUserId, existing);
  }

  try {
    const created = await tx.tradingRelationship.create({
      data: {
        tenantId,
        userId: actorUserId,
        customerId: null,
        status: "PENDING",
        initiatedBy: "BUYER",
        initiatedByUserId: actorUserId,
      },
    });
    await writeRelationshipAuditEntry(tx, {
      tenantId,
      actorUserId,
      entityType: "TradingRelationship",
      entityId: created.id,
      action: "CREATE",
      newValue: created,
      reason: "Buyer requested a connection.",
    });
    return { outcome: "created", relationship: created };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    // Another request (e.g. a double-click, or a seller inviting this same
    // buyer/tenant pair at the same instant) created the row between our
    // findUnique above and this insert. Re-read and resolve against what's
    // actually there now instead of surfacing a raw constraint-violation
    // error.
    const raced = await tx.tradingRelationship.findUnique({
      where: { userId_tenantId: { userId: actorUserId, tenantId } },
    });
    if (!raced) throw error;
    return resolveExistingForRequest(tx, actorUserId, raced);
  }
}

export function requestConnection(actorUserId: string, tenantId: string): Promise<RequestConnectionResult> {
  return withTenantContext(tenantId, (tx) => requestConnectionInTx(tx, actorUserId, tenantId));
}

// ---------------------------------------------------------------------------
// Phase 5: seller accept/decline of a buyer-initiated request.
// ---------------------------------------------------------------------------

export class RelationshipForeignTenantError extends Error {}
export class RelationshipNotRequestableError extends Error {}
export class SelectedCustomerUnavailableError extends Error {}

/**
 * Pure validation (see assertOwnPendingSellerInvitation's own comment for
 * why this is split out): given whatever row (or null) a tenant-scoped
 * lookup produced, decides whether this tenant may accept/decline it. The
 * tenantId check here is defense-in-depth on top of RLS/Layer 2 (now that
 * TradingRelationship is in TENANT_SCOPED_MODELS - see
 * src/lib/db/tenant-scoped-models.ts - a tenant-scoped findUnique by id can
 * never return a row from a different tenant in the first place), matching
 * assertOwnPendingSellerInvitation's identical pattern for the buyer side.
 */
export function assertTenantPendingBuyerRequest(
  relationship: TradingRelationship | null,
  tenantId: string
): TradingRelationship {
  if (!relationship || relationship.tenantId !== tenantId) {
    throw new RelationshipForeignTenantError("This request could not be found.");
  }
  if (relationship.status !== "PENDING" || relationship.initiatedBy !== "BUYER") {
    throw new RelationshipNotRequestableError("This request can no longer be responded to.");
  }
  return relationship;
}

export type SellerAcceptRequestTxClient = {
  customer: {
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string; tenantId: string; isActive: boolean } | null>;
  };
  customerMembership: {
    findUnique: (args: {
      where: { userId_customerId: { userId: string; customerId: string } };
    }) => Promise<{ id: string; isActive: boolean } | null>;
    create: (args: {
      data: { userId: string; customerId: string; tenantId: string; role: "BUYER_ADMIN" };
    }) => Promise<Pick<CustomerMembership, "id">>;
    update: (args: { where: { id: string }; data: { isActive: true } }) => Promise<Pick<CustomerMembership, "id">>;
  };
  tradingRelationship: {
    updateMany: (args: {
      where: { id: string; status: "PENDING" };
      data: { status: "ACTIVE"; customerId: string; respondedByUserId: string; respondedAt: Date };
    }) => Promise<{ count: number }>;
  };
  auditLogEntry: AuditWritableTxClient["auditLogEntry"];
};

export type SellerDeclineRequestTxClient = {
  tradingRelationship: {
    updateMany: (args: {
      where: { id: string; status: "PENDING" };
      data: { status: "DECLINED"; respondedByUserId: string; respondedAt: Date };
    }) => Promise<{ count: number }>;
  };
  auditLogEntry: AuditWritableTxClient["auditLogEntry"];
};

export type SellerAcceptRequestResult = {
  outcome: "activated";
  relationship: TradingRelationship;
  membershipId: string;
  membershipAction: "created" | "reactivated";
};
export type SellerDeclineRequestResult = { outcome: "declined"; relationship: TradingRelationship };

/**
 * Core accept logic, testable without a database (see the module comment).
 * `relationship` must already be verified PENDING/BUYER-initiated AND
 * belonging to this tenant by the caller (see sellerAcceptRequest below) -
 * this function trusts it was. Always call from inside
 * withTenantContext(relationship.tenantId, ...). Mirrors
 * acceptInvitationInTx (Phase 3) almost exactly - the only real difference
 * is WHICH Customer gets linked: there the buyer accepts a Customer the
 * seller already chose at invite time; here the seller explicitly chooses
 * one of their own existing active Customers right now, since a
 * buyer-initiated request never had a Customer attached to begin with and
 * none is ever auto-created from buyer data.
 */
export async function sellerAcceptRequestInTx(
  tx: SellerAcceptRequestTxClient,
  actorUserId: string,
  relationship: TradingRelationship,
  selectedCustomerId: string
): Promise<SellerAcceptRequestResult> {
  const customer = await tx.customer.findUnique({ where: { id: selectedCustomerId } });
  if (!customer || !customer.isActive || customer.tenantId !== relationship.tenantId) {
    throw new SelectedCustomerUnavailableError("The selected customer could not be found or is not active.");
  }

  const existingMembership = await tx.customerMembership.findUnique({
    where: { userId_customerId: { userId: relationship.userId, customerId: selectedCustomerId } },
  });

  let membershipId: string;
  let membershipAction: "created" | "reactivated";
  if (existingMembership) {
    if (!existingMembership.isActive) {
      await tx.customerMembership.update({ where: { id: existingMembership.id }, data: { isActive: true } });
    }
    membershipId = existingMembership.id;
    membershipAction = "reactivated";
  } else {
    const created = await tx.customerMembership.create({
      data: {
        userId: relationship.userId,
        customerId: selectedCustomerId,
        tenantId: relationship.tenantId,
        role: "BUYER_ADMIN",
      },
    });
    membershipId = created.id;
    membershipAction = "created";
  }

  const respondedAt = new Date();
  const result = await tx.tradingRelationship.updateMany({
    where: { id: relationship.id, status: "PENDING" },
    data: { status: "ACTIVE", customerId: selectedCustomerId, respondedByUserId: actorUserId, respondedAt },
  });

  if (result.count === 0) {
    // Someone else already responded (e.g. a second tab's click, or the
    // buyer somehow responding at the same instant). The membership write
    // above happened in THIS SAME database transaction - withTenantContext
    // wraps this whole function in one prisma.$transaction
    // (src/lib/db/with-tenant.ts), which only commits once the callback
    // resolves without throwing. Throwing here rolls the entire transaction
    // back, including the membership create/reactivate, so no
    // CustomerMembership is left behind (no orphaned membership) for a
    // relationship that didn't actually end up ACTIVE.
    throw new RelationshipAlreadyRespondedError("This request has already been responded to.");
  }

  await writeRelationshipAuditEntry(tx, {
    tenantId: relationship.tenantId,
    actorUserId,
    entityType: "CustomerMembership",
    entityId: membershipId,
    action: membershipAction === "created" ? "CREATE" : "REACTIVATE",
    newValue: { userId: relationship.userId, customerId: selectedCustomerId, tenantId: relationship.tenantId },
    reason: `Seller accepted trading relationship ${relationship.id}.`,
  });

  const updatedRelationship: TradingRelationship = {
    ...relationship,
    status: "ACTIVE",
    customerId: selectedCustomerId,
    respondedByUserId: actorUserId,
    respondedAt,
  };

  await writeRelationshipAuditEntry(tx, {
    tenantId: relationship.tenantId,
    actorUserId,
    entityType: "TradingRelationship",
    entityId: relationship.id,
    action: "UPDATE",
    oldValue: relationship,
    newValue: updatedRelationship,
    reason: "Seller accepted the buyer's request.",
  });

  return { outcome: "activated", relationship: updatedRelationship, membershipId, membershipAction };
}

/** Core decline logic, testable without a database - same preconditions as sellerAcceptRequestInTx above. Never touches CustomerMembership. */
export async function sellerDeclineRequestInTx(
  tx: SellerDeclineRequestTxClient,
  actorUserId: string,
  relationship: TradingRelationship
): Promise<SellerDeclineRequestResult> {
  const respondedAt = new Date();
  const result = await tx.tradingRelationship.updateMany({
    where: { id: relationship.id, status: "PENDING" },
    data: { status: "DECLINED", respondedByUserId: actorUserId, respondedAt },
  });

  if (result.count === 0) {
    throw new RelationshipAlreadyRespondedError("This request has already been responded to.");
  }

  const updatedRelationship: TradingRelationship = {
    ...relationship,
    status: "DECLINED",
    respondedByUserId: actorUserId,
    respondedAt,
  };

  await writeRelationshipAuditEntry(tx, {
    tenantId: relationship.tenantId,
    actorUserId,
    entityType: "TradingRelationship",
    entityId: relationship.id,
    action: "UPDATE",
    oldValue: relationship,
    newValue: updatedRelationship,
    reason: "Seller declined the buyer's request.",
  });

  return { outcome: "declined", relationship: updatedRelationship };
}

/**
 * The real entry points. Both re-read the relationship under the CURRENT
 * seller's own tenant context (withTenantContext(tenantId, ...)) - a
 * single transaction covers the read, the validation, and the write, with
 * no separate discovery step needed (unlike the buyer side's
 * discoverOwnPendingSellerInvitation, which has to use withUserContext
 * because a buyer may have no tenant context yet - a seller calling these
 * always already has one, via requireSellerSession).
 */
export async function sellerAcceptRequest(
  tenantId: string,
  actorUserId: string,
  relationshipId: string,
  selectedCustomerId: string
): Promise<SellerAcceptRequestResult> {
  return withTenantContext(tenantId, async (tx) => {
    const relationship = await tx.tradingRelationship.findUnique({ where: { id: relationshipId } });
    const validated = assertTenantPendingBuyerRequest(relationship, tenantId);
    return sellerAcceptRequestInTx(tx, actorUserId, validated, selectedCustomerId);
  });
}

export async function sellerDeclineRequest(
  tenantId: string,
  actorUserId: string,
  relationshipId: string
): Promise<SellerDeclineRequestResult> {
  return withTenantContext(tenantId, async (tx) => {
    const relationship = await tx.tradingRelationship.findUnique({ where: { id: relationshipId } });
    const validated = assertTenantPendingBuyerRequest(relationship, tenantId);
    return sellerDeclineRequestInTx(tx, actorUserId, validated);
  });
}

export type PendingBuyerRequest = TradingRelationship & {
  user: { name: string; email: string };
};

/**
 * Lists this tenant's PENDING, buyer-initiated requests for the "Buyer
 * requests" seller page. User carries no RLS at all (see
 * prisma/rls/policies.sql's "Deliberately NOT RLS-protected" section), so
 * nesting `user: { select: {...} } }` here is safe in one query - unlike
 * Customer, which does carry RLS and needs the two-query workaround seen
 * elsewhere in this module.
 */
export function listPendingBuyerRequestsForTenant(tenantId: string): Promise<PendingBuyerRequest[]> {
  return withTenantContext(tenantId, (tx) =>
    tx.tradingRelationship.findMany({
      where: { status: "PENDING", initiatedBy: "BUYER" },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    })
  );
}

// ---------------------------------------------------------------------------
// Phase 6: revoke an ACTIVE relationship (either side).
// ---------------------------------------------------------------------------

export class RelationshipNotActiveError extends Error {}
export class RelationshipCustomerMismatchError extends Error {}

export type RevokeConnectionTxClient = {
  customerMembership: {
    findUnique: (args: {
      where: { userId_customerId: { userId: string; customerId: string } };
    }) => Promise<{ id: string; isActive: boolean } | null>;
    update: (args: { where: { id: string }; data: { isActive: false } }) => Promise<Pick<CustomerMembership, "id">>;
  };
  tradingRelationship: {
    updateMany: (args: {
      where: { id: string; status: "ACTIVE" };
      data: { status: "REVOKED"; revokedByUserId: string; revokedAt: Date };
    }) => Promise<{ count: number }>;
  };
  auditLogEntry: AuditWritableTxClient["auditLogEntry"];
};

export type RevokeConnectionResult = {
  outcome: "revoked";
  relationship: TradingRelationship;
  /** The CustomerMembership id that was deactivated, or null if none was found (shouldn't happen for a genuinely ACTIVE relationship, but handled defensively - see revokeConnectionInTx). Callers use this for cookie hygiene only - see /[locale]/connections/actions.ts. */
  membershipId: string | null;
};

/**
 * Core revoke logic, testable without a database (see the module comment).
 * `relationship` must already be verified ACTIVE and belonging to the
 * correct caller/tenant/customer by whichever of revokeConnectionAsBuyer/
 * revokeConnectionAsSeller called this - this function trusts it was.
 * Always call from inside withTenantContext(relationship.tenantId, ...).
 *
 * Order matters for the atomic invariant: the conditional
 * ACTIVE -> REVOKED transition runs FIRST. If it loses a race (count: 0),
 * this throws immediately, before ever touching CustomerMembership - no
 * membership write is attempted for a relationship that didn't actually
 * end up REVOKED. Only once that transition is confirmed does this look up
 * and deactivate the linked CustomerMembership, in the same database
 * transaction - withTenantContext wraps this whole function in one
 * prisma.$transaction (src/lib/db/with-tenant.ts), so any later throw
 * still rolls the relationship transition back too.
 */
export async function revokeConnectionInTx(
  tx: RevokeConnectionTxClient,
  actorUserId: string,
  relationship: TradingRelationship
): Promise<RevokeConnectionResult> {
  const revokedAt = new Date();
  const result = await tx.tradingRelationship.updateMany({
    where: { id: relationship.id, status: "ACTIVE" },
    data: { status: "REVOKED", revokedByUserId: actorUserId, revokedAt },
  });

  if (result.count === 0) {
    throw new RelationshipNotActiveError("This collaboration is no longer active.");
  }

  const updatedRelationship: TradingRelationship = {
    ...relationship,
    status: "REVOKED",
    revokedByUserId: actorUserId,
    revokedAt,
  };

  // Deactivate the linked CustomerMembership, if one exists. By the hard
  // invariant established in Phase 3/5 (accepting always sets customerId
  // and creates/reactivates CustomerMembership together, atomically), an
  // ACTIVE relationship should always have both - this is still handled
  // defensively (null customerId, or no/already-inactive membership row)
  // rather than treating it as an error, since the relationship side of
  // the revoke has already succeeded and that's the primary guarantee.
  let membershipId: string | null = null;
  if (relationship.customerId) {
    const membership = await tx.customerMembership.findUnique({
      where: { userId_customerId: { userId: relationship.userId, customerId: relationship.customerId } },
    });
    if (membership?.isActive) {
      await tx.customerMembership.update({ where: { id: membership.id }, data: { isActive: false } });
      membershipId = membership.id;

      await writeRelationshipAuditEntry(tx, {
        tenantId: relationship.tenantId,
        actorUserId,
        entityType: "CustomerMembership",
        entityId: membership.id,
        action: "DEACTIVATE",
        newValue: { userId: relationship.userId, customerId: relationship.customerId, tenantId: relationship.tenantId },
        reason: `Trading relationship ${relationship.id} was revoked.`,
      });
    } else if (membership) {
      membershipId = membership.id;
    }
  }

  await writeRelationshipAuditEntry(tx, {
    tenantId: relationship.tenantId,
    actorUserId,
    entityType: "TradingRelationship",
    entityId: relationship.id,
    action: "UPDATE",
    oldValue: relationship,
    newValue: updatedRelationship,
    reason: "Trading relationship revoked.",
  });

  return { outcome: "revoked", relationship: updatedRelationship, membershipId };
}

/**
 * Finds `relationshipId` through the CALLER's own self-row RLS access
 * (withUserContext) and verifies it is currently ACTIVE and belongs to
 * that exact user - same ownership defense-in-depth pattern as
 * assertOwnPendingSellerInvitation. A relationship belonging to a
 * different user is NEVER revoked through this path, by construction.
 */
export function assertOwnActiveRelationship(
  relationship: TradingRelationship | null,
  callerUserId: string
): TradingRelationship {
  if (!relationship || relationship.userId !== callerUserId) {
    throw new RelationshipNotFoundError("This collaboration could not be found.");
  }
  if (relationship.status !== "ACTIVE") {
    throw new RelationshipNotActiveError("This collaboration is no longer active.");
  }
  return relationship;
}

async function discoverOwnActiveRelationship(callerUserId: string, relationshipId: string): Promise<TradingRelationship> {
  const relationship = await withUserContext(callerUserId, (tx) =>
    tx.tradingRelationship.findUnique({ where: { id: relationshipId } })
  );
  return assertOwnActiveRelationship(relationship, callerUserId);
}

/** Buyer-side entry point - see the module comment on assertOwnActiveRelationship for the ownership guarantee. */
export async function revokeConnectionAsBuyer(callerUserId: string, relationshipId: string): Promise<RevokeConnectionResult> {
  const relationship = await discoverOwnActiveRelationship(callerUserId, relationshipId);
  return withTenantContext(relationship.tenantId, (tx) => revokeConnectionInTx(tx, callerUserId, relationship));
}

/**
 * Pure validation for the seller-side revoke path: the relationship must
 * belong to this tenant AND to the exact Customer the seller's "Buyer
 * access" card is currently showing (the caller passes `customerId` from
 * the page's own route param, never from the relationship row itself) -
 * this is what stops a seller revoking a relationship by guessing an id
 * while viewing an unrelated customer's page.
 */
export function assertTenantActiveRelationshipForCustomer(
  relationship: TradingRelationship | null,
  tenantId: string,
  customerId: string
): TradingRelationship {
  if (!relationship || relationship.tenantId !== tenantId) {
    throw new RelationshipForeignTenantError("This collaboration could not be found.");
  }
  if (relationship.status !== "ACTIVE") {
    throw new RelationshipNotActiveError("This collaboration is no longer active.");
  }
  if (relationship.customerId !== customerId) {
    throw new RelationshipCustomerMismatchError("This collaboration does not belong to this customer.");
  }
  return relationship;
}

/** Seller-side entry point - re-reads under the CURRENT seller tenant context, same shape as sellerAcceptRequest/sellerDeclineRequest. */
export async function revokeConnectionAsSeller(
  tenantId: string,
  actorUserId: string,
  customerId: string,
  relationshipId: string
): Promise<RevokeConnectionResult> {
  return withTenantContext(tenantId, async (tx) => {
    const relationship = await tx.tradingRelationship.findUnique({ where: { id: relationshipId } });
    const validated = assertTenantActiveRelationshipForCustomer(relationship, tenantId, customerId);
    return revokeConnectionInTx(tx, actorUserId, validated);
  });
}

export type ActiveCollaboration = { relationshipId: string; tenantName: string; customerName: string };

/**
 * Lists the caller's own ACTIVE relationships across every tenant, for the
 * "Active collaborations" section of /[locale]/connections - same
 * self-row-then-per-tenant-customer-lookup shape as
 * listPendingSellerInvitationsForUser (Customer carries RLS with no
 * userId-based exemption, so its name can't be nested into the
 * withUserContext query - see that function's own comment).
 */
export async function listActiveCollaborationsForUser(userId: string): Promise<ActiveCollaboration[]> {
  const relationships = await withUserContext(userId, (tx) =>
    tx.tradingRelationship.findMany({
      where: { userId, status: "ACTIVE" },
      include: { tenant: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    })
  );

  const results: ActiveCollaboration[] = [];
  for (const relationship of relationships) {
    let customerName = "";
    if (relationship.customerId) {
      const customer = await withTenantContext(relationship.tenantId, (tx) =>
        tx.customer.findUnique({ where: { id: relationship.customerId! }, select: { name: true } })
      );
      customerName = customer?.name ?? "";
    }
    results.push({ relationshipId: relationship.id, tenantName: relationship.tenant.name, customerName });
  }
  return results;
}
