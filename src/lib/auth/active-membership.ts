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

/**
 * Resolves what a given User is currently allowed to act as. A suspended
 * tenant blocks its TenantMemberships from being selected even if the
 * membership row itself is still marked active - the tenant's own status is
 * the outer gate. Same idea for a deactivated Customer (buyer company)
 * blocking its CustomerMemberships.
 *
 * MVP has no organization-switcher UI yet (see docs/USER_ROLES_AND_PERMISSIONS.md §5):
 * if a user somehow holds more than one active membership, the first one
 * found wins deterministically (tenant memberships before customer
 * memberships). This is intentionally simple - Phase 2 replaces "first one
 * wins" with an explicit user choice, without needing a schema change.
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
export async function resolveActiveMembership(userId: string): Promise<ResolvedIdentity> {
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
    for (const membership of user.customerMemberships) {
      const customer = await withCustomerContext(membership.tenantId, membership.customerId, (tx) =>
        tx.customer.findUnique({ where: { id: membership.customerId } })
      );
      if (customer?.isActive) {
        activeMembership = {
          type: "CUSTOMER",
          tenantId: membership.tenantId,
          customerId: membership.customerId,
          role: membership.role,
        };
        break;
      }
    }
  }

  return {
    isActive: true,
    isPlatformAdmin: user.isPlatformAdmin,
    activeMembership,
  };
}
