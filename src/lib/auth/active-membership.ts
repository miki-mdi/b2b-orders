import type { CustomerRole, TenantRole } from "@prisma/client";
import { withUserContext } from "@/lib/db/with-user-context";
import { withCustomerContext } from "@/lib/db/with-tenant";

/**
 * What a session is currently acting as. Resolved fresh from the database at
 * sign-in and re-resolved on every subsequent request (see auth.ts's jwt
 * callback) - not just cached forever in the token - specifically so a
 * deactivated user/membership or a suspended tenant loses access immediately,
 * without waiting for the JWT to expire. See docs/SECURITY_AND_MULTI_TENANCY.md §5.
 */
export type ActiveMembership =
  | { type: "TENANT"; tenantId: string; role: TenantRole }
  | { type: "CUSTOMER"; tenantId: string; customerId: string; role: CustomerRole }
  | null;

export type ResolvedIdentity = {
  isActive: boolean;
  isPlatformAdmin: boolean;
  activeMembership: ActiveMembership;
};

const INACTIVE: ResolvedIdentity = {
  isActive: false,
  isPlatformAdmin: false,
  activeMembership: null,
};

type CandidateCustomerMembership = { id: string; tenantId: string; customerId: string; role: CustomerRole };

/**
 * The one place that decides whether a CandidateCustomerMembership is
 * CURRENTLY usable: membership.isActive is already guaranteed by the
 * `where: { isActive: true }` filter every caller below applies before this
 * runs, so this only has to verify the two things that filter can't express -
 * the linked Customer's own isActive flag AND its Tenant's status.
 *
 * Correction made while adding the buyer seller-switcher: the Tenant.status
 * check below did NOT exist here before - only the TENANT (seller) branch of
 * resolveActiveMembership checked `tenant.status === "ACTIVE"`; a buyer's
 * CustomerMembership at a SUSPENDED tenant was previously still treated as
 * usable, since Customer's own RLS policy has no join to Tenant to catch
 * this. Fixing it here closes that gap everywhere a candidate is evaluated -
 * default resolution, the seller-switcher's listing, and the switch action's
 * own validation all go through this one function, so there is exactly one
 * place this rule can drift from correct.
 */
async function validateCustomerMembershipCandidate(
  membership: CandidateCustomerMembership
): Promise<{ customerName: string; tenantName: string } | null> {
  const customer = await withCustomerContext(membership.tenantId, membership.customerId, (tx) =>
    tx.customer.findUnique({
      where: { id: membership.customerId },
      select: { name: true, isActive: true, tenant: { select: { name: true, status: true } } },
    })
  );
  if (!customer || !customer.isActive || customer.tenant.status !== "ACTIVE") {
    return null;
  }
  return { customerName: customer.name, tenantName: customer.tenant.name };
}

/**
 * Resolves what a given User is currently allowed to act as. A suspended
 * tenant blocks its TenantMemberships from being selected even if the
 * membership row itself is still marked active - the tenant's own status is
 * the outer gate. Same idea for a deactivated Customer (buyer company) or
 * its Tenant blocking its CustomerMemberships - see
 * validateCustomerMembershipCandidate above.
 *
 * `preferredMembershipId` (the buyer seller-switcher): an OPTIONAL hint,
 * supplied by requireBuyerSession() from the `activeBuyerMembershipId`
 * cookie - see src/lib/auth/require-buyer.ts. It is never trusted on its
 * own: this function always loads the user's freshly authorized, currently
 * valid CustomerMembership candidates first, EXACTLY as it does with no
 * preference at all, and only then checks whether the preferred id is one
 * of those already-valid candidates. A preferred id that doesn't belong to
 * this user, isn't active, or points at a now-invalid customer/tenant
 * simply never matches anything in that set - there is no separate "look
 * this id up directly" path that could be fooled by a stale or forged
 * value, so this can never grant access beyond what the user already has.
 * When no preference is given (or none matches), behavior is byte-for-byte
 * the pre-existing "first active membership wins" default - the
 * auth.ts jwt callback, which never supplies this argument, is completely
 * unaffected by this parameter's existence.
 *
 * MVP still has no TENANT-side (seller) switcher (see
 * docs/USER_ROLES_AND_PERMISSIONS.md §5): if a user somehow holds more than
 * one active TenantMembership, or holds both a TenantMembership and a
 * CustomerMembership, "tenant memberships before customer memberships,
 * first one found wins" still applies unchanged for that case.
 *
 * Two-step lookup, deliberately: this runs BEFORE any tenant/customer
 * context is known, so it can't use the normal withTenantContext/
 * withCustomerContext path directly for the discovery step. Instead:
 *
 *  1. withUserContext(userId, ...) discovers candidate TenantMembership/
 *     CustomerMembership rows, relying on the read-only RLS exemption added
 *     specifically for this ("userId" = app.current_user_id) - see
 *     src/lib/db/with-user-context.ts and prisma/rls/policies.sql.
 *  2. For a candidate CustomerMembership, the Customer row's own isActive
 *     flag is verified via the NORMAL withCustomerContext path, now that
 *     step 1 has told us which tenantId/customerId to scope to. Customer
 *     itself was deliberately NOT given a userId-based RLS exemption (only
 *     TenantMembership/CustomerMembership were, per the approved fix's
 *     scope) - nesting a `customer: true` include inside withUserContext's
 *     transaction would have been silently blocked by Customer's ordinary
 *     RLS policy instead of working, which is why this is two queries
 *     instead of one. (TenantMembership's nested `tenant: true` include
 *     doesn't have this problem - Tenant carries no RLS at all, being
 *     platform-level rather than tenant-owned data.)
 */
export async function resolveActiveMembership(
  userId: string,
  preferredMembershipId?: string
): Promise<ResolvedIdentity> {
  const user = await withUserContext(userId, (tx) =>
    tx.user.findUnique({
      where: { id: userId },
      include: {
        tenantMemberships: { where: { isActive: true }, include: { tenant: true } },
        customerMemberships: { where: { isActive: true } },
      },
    })
  );

  if (!user || !user.isActive) {
    return INACTIVE;
  }

  const tenantMembership = user.tenantMemberships.find((m) => m.tenant.status === "ACTIVE");

  let activeMembership: ActiveMembership = null;

  if (tenantMembership) {
    activeMembership = {
      type: "TENANT",
      tenantId: tenantMembership.tenantId,
      role: tenantMembership.role,
    };
  } else {
    let defaultMembership: ActiveMembership = null;
    let preferredMatch: ActiveMembership = null;

    for (const membership of user.customerMemberships) {
      const valid = await validateCustomerMembershipCandidate(membership);
      if (!valid) continue;

      const candidate: ActiveMembership = {
        type: "CUSTOMER",
        tenantId: membership.tenantId,
        customerId: membership.customerId,
        role: membership.role,
      };

      if (!defaultMembership) defaultMembership = candidate;

      if (preferredMembershipId && membership.id === preferredMembershipId) {
        preferredMatch = candidate;
        break;
      }

      // No preference was supplied at all - preserve the original
      // single-round-trip "first valid one wins" shortcut exactly, instead
      // of unconditionally scanning every membership (which the preferred-
      // id search above needs to do in the worst case).
      if (!preferredMembershipId) break;
    }

    activeMembership = preferredMatch ?? defaultMembership;
  }

  return {
    isActive: true,
    isPlatformAdmin: user.isPlatformAdmin,
    activeMembership,
  };
}

export type ActiveBuyerSellerOption = {
  membershipId: string;
  // tenantId/customerId exist here so the selector page can decide which
  // option is the CURRENTLY selected one (by comparing against
  // requireBuyerSession()'s own tenantId/customerId) - they are never meant
  // to be rendered; only tenantName/customerName are.
  tenantId: string;
  customerId: string;
  tenantName: string;
  customerName: string;
};

/**
 * Every ACTIVE, currently-valid CustomerMembership this user holds, across
 * every tenant - the full list the default-wins single choice in
 * resolveActiveMembership is drawn from, exposed for the buyer
 * seller-switcher UI (/[locale]/buyer/sellers). Sequential, not
 * Promise.all, same connection-pool-safety reasoning already applied to
 * src/lib/domain/admin/admin-service.ts and
 * listPendingSellerInvitationsForUser.
 */
export async function listActiveCustomerMembershipsForUser(userId: string): Promise<ActiveBuyerSellerOption[]> {
  const user = await withUserContext(userId, (tx) =>
    tx.user.findUnique({
      where: { id: userId },
      select: { customerMemberships: { where: { isActive: true } } },
    })
  );
  if (!user) return [];

  const options: ActiveBuyerSellerOption[] = [];
  for (const membership of user.customerMemberships) {
    const valid = await validateCustomerMembershipCandidate(membership);
    if (!valid) continue;
    options.push({
      membershipId: membership.id,
      tenantId: membership.tenantId,
      customerId: membership.customerId,
      tenantName: valid.tenantName,
      customerName: valid.customerName,
    });
  }
  return options;
}

/**
 * Looks up `membershipId` through the CALLER's own self-row RLS access
 * (withUserContext) and returns it only if it is still a currently-valid,
 * ACTIVE CustomerMembership belonging to that exact user - the one
 * sanctioned way the buyer seller-switcher's Server Action (see
 * src/app/[locale]/buyer/sellers/actions.ts) is allowed to validate a
 * requested membership before setting the activeBuyerMembershipId cookie.
 * A membership belonging to a different user is invisible to the RLS
 * lookup itself (the self-row exemption only ever returns the caller's own
 * rows); the explicit userId/isActive check below is defense-in-depth on
 * top of that, matching this codebase's existing "the domain layer
 * re-checks, not just the access path" convention.
 */
export async function findOwnActiveCustomerMembership(
  userId: string,
  membershipId: string
): Promise<{ membershipId: string } | null> {
  const membership = await withUserContext(userId, (tx) =>
    tx.customerMembership.findUnique({ where: { id: membershipId } })
  );
  if (!membership || membership.userId !== userId || !membership.isActive) {
    return null;
  }

  const valid = await validateCustomerMembershipCandidate(membership);
  if (!valid) return null;

  return { membershipId: membership.id };
}
