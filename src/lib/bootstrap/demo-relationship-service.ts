/**
 * Pure reconciliation decisions for prisma/seed-local-demo-relationships.ts -
 * split out from any database/domain-service call for the same reason as
 * demo-account-service.ts: fully unit-testable with plain objects, no
 * mocked client, no database.
 *
 * The rule throughout (per the approved plan's explicit safeguard): never
 * blindly call inviteBuyerForCustomer()/requestConnection() for every
 * target on every run. First inspect the existing TradingRelationship (if
 * any) for the exact buyer+tenant pair. If it already matches the EXACT
 * expected target state, skip cleanly - no write. If it exists but in any
 * OTHER state (wrong status, wrong initiator, wrong/missing customer),
 * throw immediately - never silently relink, reinvite, or overwrite it.
 * Only when no row exists at all does this return a "create" action.
 */
export class DemoRelationshipInconsistentError extends Error {}

type ExistingRelationship = {
  status: string;
  initiatedBy: string;
  customerId: string | null;
};

export type DemoRelationshipReconciliation =
  | { action: "skip" }
  | { action: "create-and-accept" }
  | { action: "create-only" };

/** For a target ACTIVE relationship (buyer1/buyer2/buyer3's connections). */
export function reconcileActiveRelationshipState(params: {
  existing: ExistingRelationship | null;
  expectedCustomerId: string;
  label: string;
}): DemoRelationshipReconciliation {
  const { existing, expectedCustomerId, label } = params;

  if (!existing) {
    return { action: "create-and-accept" };
  }

  if (existing.status === "ACTIVE" && existing.customerId === expectedCustomerId) {
    return { action: "skip" };
  }

  throw new DemoRelationshipInconsistentError(
    `${label}: an existing relationship was found with status=${existing.status}, ` +
      `customerId=${existing.customerId ?? "null"}, but the expected target is ACTIVE with ` +
      `customerId=${expectedCustomerId}. Refusing to relink or overwrite it - resolve manually.`
  );
}

/** For a target PENDING seller-initiated invitation (buyer4's case). */
export function reconcilePendingSellerInviteState(params: {
  existing: ExistingRelationship | null;
  expectedCustomerId: string;
  label: string;
}): DemoRelationshipReconciliation {
  const { existing, expectedCustomerId, label } = params;

  if (!existing) {
    return { action: "create-only" };
  }

  if (existing.status === "PENDING" && existing.initiatedBy === "SELLER" && existing.customerId === expectedCustomerId) {
    return { action: "skip" };
  }

  throw new DemoRelationshipInconsistentError(
    `${label}: an existing relationship was found with status=${existing.status}, ` +
      `initiatedBy=${existing.initiatedBy}, customerId=${existing.customerId ?? "null"}, but the expected target ` +
      `is PENDING/SELLER-initiated with customerId=${expectedCustomerId}. Refusing to overwrite it - resolve manually.`
  );
}

/** For a target PENDING buyer-initiated request (buyer5's case) - no customer is ever expected. */
export function reconcilePendingBuyerRequestState(params: {
  existing: ExistingRelationship | null;
  label: string;
}): DemoRelationshipReconciliation {
  const { existing, label } = params;

  if (!existing) {
    return { action: "create-only" };
  }

  if (existing.status === "PENDING" && existing.initiatedBy === "BUYER" && existing.customerId === null) {
    return { action: "skip" };
  }

  throw new DemoRelationshipInconsistentError(
    `${label}: an existing relationship was found with status=${existing.status}, ` +
      `initiatedBy=${existing.initiatedBy}, customerId=${existing.customerId ?? "null"}, but the expected target ` +
      "is PENDING/BUYER-initiated with no customer. Refusing to overwrite it - resolve manually."
  );
}

export type DemoPriceListAssignmentReconciliation = { action: "skip" } | { action: "assign" };

/**
 * For an ACTIVE demo relationship's Customer: the Customer should end up assigned to the
 * tenant's DEMO_STANDARD_PRICE_LIST_CODE price list. Same "never silently relink" rule as
 * above - a missing assignment is set, an already-correct one is skipped, and an assignment
 * pointing at any OTHER price list is treated as unexpected manual state and refused.
 */
export function reconcilePriceListAssignmentState(params: {
  existingPriceListId: string | null;
  expectedPriceListId: string;
  label: string;
}): DemoPriceListAssignmentReconciliation {
  const { existingPriceListId, expectedPriceListId, label } = params;

  if (existingPriceListId === null) {
    return { action: "assign" };
  }

  if (existingPriceListId === expectedPriceListId) {
    return { action: "skip" };
  }

  throw new DemoRelationshipInconsistentError(
    `${label}: the Customer already has a different price list assigned (id=${existingPriceListId}), but the ` +
      `expected target is the tenant's standard price list (id=${expectedPriceListId}). Refusing to overwrite it - ` +
      "resolve manually."
  );
}
