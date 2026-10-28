/**
 * Pure reconciliation decisions for prisma/create-local-demo-accounts.ts -
 * deliberately split out from any database call (same reasoning as every
 * "assert.../reconcile..." pure function elsewhere in this codebase, e.g.
 * trading-relationship-service.ts's assertOwnActiveRelationship) so this
 * logic is unit-testable with plain objects, no mocked client, no database
 * at all.
 *
 * The rule throughout: an ABSENT tenant/user is created. An EXISTING one is
 * only ever treated as a clean no-op if it fully matches the expected demo
 * identity and structure; anything else (wrong name, missing admin,
 * missing/wrong-role/inactive membership, wrong buyer name, deactivated
 * buyer) is a partial/inconsistent local state and throws immediately,
 * stopping the whole script rather than silently skipping or "fixing" it.
 */
export class DemoAccountInconsistentError extends Error {}

export type DemoReconciliation = { action: "skip" } | { action: "create" };

export function reconcileDemoTenantState(params: {
  existingTenant: { name: string } | null;
  existingAdminUser: { id: string } | null;
  existingMembership: { role: string; isActive: boolean } | null;
  expectedName: string;
  label: string;
}): DemoReconciliation {
  const { existingTenant, existingAdminUser, existingMembership, expectedName, label } = params;

  if (!existingTenant) {
    return { action: "create" };
  }

  if (existingTenant.name !== expectedName) {
    throw new DemoAccountInconsistentError(
      `${label}: a tenant with this slug already exists with name "${existingTenant.name}", expected ` +
        `"${expectedName}". Refusing to continue - resolve this manually before re-running.`
    );
  }

  if (!existingAdminUser) {
    throw new DemoAccountInconsistentError(
      `${label}: the tenant already exists but its expected Seller Admin user does not. Partial/inconsistent ` +
        "local state - refusing to create a second admin for an existing tenant. Resolve manually."
    );
  }

  if (!existingMembership || existingMembership.role !== "SELLER_ADMIN" || !existingMembership.isActive) {
    throw new DemoAccountInconsistentError(
      `${label}: the tenant and its expected admin user both exist, but there is no active SELLER_ADMIN ` +
        "TenantMembership linking them. Partial/inconsistent local state - refusing to modify it. Resolve manually."
    );
  }

  return { action: "skip" };
}

export function reconcileDemoBuyerState(params: {
  existingUser: { name: string; isActive: boolean } | null;
  expectedName: string;
  label: string;
}): DemoReconciliation {
  const { existingUser, expectedName, label } = params;

  if (!existingUser) {
    return { action: "create" };
  }

  if (existingUser.name !== expectedName) {
    throw new DemoAccountInconsistentError(
      `${label}: a user with this email already exists with name "${existingUser.name}", expected ` +
        `"${expectedName}". Refusing to treat this as the demo buyer - resolve manually before re-running.`
    );
  }

  if (!existingUser.isActive) {
    throw new DemoAccountInconsistentError(
      `${label}: the demo buyer already exists but is deactivated. Refusing to silently reactivate it - resolve manually.`
    );
  }

  return { action: "skip" };
}
