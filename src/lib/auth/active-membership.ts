import type { CustomerRole, TenantRole } from "@prisma/client";
import { prismaBase } from "@/lib/db/prisma";

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
 * the outer gate.
 *
 * MVP has no organization-switcher UI yet (see docs/USER_ROLES_AND_PERMISSIONS.md §5):
 * if a user somehow holds more than one active membership, the first one
 * found wins deterministically (tenant memberships before customer
 * memberships). This is intentionally simple - Phase 2 replaces "first one
 * wins" with an explicit user choice, without needing a schema change.
 */
export async function resolveActiveMembership(userId: string): Promise<ResolvedIdentity> {
  const user = await prismaBase.user.findUnique({
    where: { id: userId },
    include: {
      tenantMemberships: {
        where: { isActive: true },
        include: { tenant: true },
      },
      customerMemberships: {
        where: { isActive: true },
        include: { customer: true },
      },
    },
  });

  if (!user || !user.isActive) {
    return INACTIVE;
  }

  const tenantMembership = user.tenantMemberships.find((m) => m.tenant.status === "ACTIVE");
  const customerMembership = user.customerMemberships.find((m) => m.customer.isActive);

  let activeMembership: ActiveMembership = null;
  if (tenantMembership) {
    activeMembership = {
      type: "TENANT",
      tenantId: tenantMembership.tenantId,
      role: tenantMembership.role,
    };
  } else if (customerMembership) {
    activeMembership = {
      type: "CUSTOMER",
      tenantId: customerMembership.tenantId,
      customerId: customerMembership.customerId,
      role: customerMembership.role,
    };
  }

  return {
    isActive: true,
    isPlatformAdmin: user.isPlatformAdmin,
    activeMembership,
  };
}
