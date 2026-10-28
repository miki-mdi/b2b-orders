import type { CustomerRole, TenantRole, TenantStatus } from "@prisma/client";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";

/**
 * Read-only platform-admin data (Admin v1). Every exported function here is
 * called only from a route already gated by requirePlatformAdminSession() -
 * this module performs no authorization check of its own.
 *
 * Why this loops per-tenant instead of one unscoped query:
 * TenantMembership and CustomerMembership are RLS-FORCED (prisma/rls/policies.sql)
 * for every role the app ever connects as, including prismaBase - FORCE
 * applies regardless of which Prisma client instance issues the query. Their
 * SELECT policy requires app.current_tenant_id to match, with one narrow
 * exception (a user's own rows, used only by the login-discovery path in
 * src/lib/db/with-user-context.ts - not reused here, since that exemption is
 * documented as having a single, auditable call site). A plain
 * `prismaBase.tenantMembership.findMany()` would silently return zero rows
 * rather than error, which would make this page quietly wrong instead of
 * loudly broken - worse than either an error or the extra queries below.
 * Looping each tenant through the ordinary, already-audited
 * withTenantContext() helper (the same one every seller-side service uses)
 * reads every row through the ordinary tenant-scoped path, so no new RLS
 * policy or exemption is added or weakened.
 *
 * Tenant and User themselves carry no RLS at all (platform-level data, not
 * tenant-owned - see policies.sql's own header comment), so those two reads
 * go straight through prismaBase with no per-tenant loop needed.
 */

export type AdminTenantSummary = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  defaultVatRate: string;
  memberCount: number;
  customerCount: number;
  orderCount: number;
};

export async function listTenantsForAdmin(): Promise<AdminTenantSummary[]> {
  const tenants = await prismaBase.tenant.findMany({ orderBy: { name: "asc" } });

  // Sequential, not Promise.all: each withTenantContext() call opens its own
  // interactive transaction, and firing one per tenant concurrently measurably
  // competes with the local dev connection pool against auth's own
  // concurrent session-resolution transaction (resolveActiveMembership) -
  // observed directly during manual verification of this page causing an
  // intermittent "Unable to start a transaction in the given time" /
  // JWTSessionError. This page is admin-only and low-traffic, so the small
  // added latency from running one tenant at a time is the right trade.
  const summaries: AdminTenantSummary[] = [];
  for (const tenant of tenants) {
    const [memberCount, customerCount, orderCount] = await withTenantContext(tenant.id, (tx) =>
      Promise.all([tx.tenantMembership.count(), tx.customer.count(), tx.order.count()])
    );
    summaries.push({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      defaultVatRate: tenant.defaultVatRate.toString(),
      memberCount,
      customerCount,
      orderCount,
    });
  }
  return summaries;
}

export type AdminMembershipSummary =
  | { type: "TENANT"; label: string; role: TenantRole; isActive: boolean }
  | { type: "CUSTOMER"; label: string; role: CustomerRole; isActive: boolean };

export type AdminUserSummary = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  isPlatformAdmin: boolean;
  memberships: AdminMembershipSummary[];
};

export async function listUsersForAdmin(): Promise<AdminUserSummary[]> {
  const [users, tenants] = await Promise.all([
    // Explicit select - passwordHash (and any other sensitive column added
    // later) must never be fetched here, not just never displayed.
    prismaBase.user.findMany({
      select: { id: true, name: true, email: true, isActive: true, isPlatformAdmin: true },
      orderBy: { name: "asc" },
    }),
    prismaBase.tenant.findMany({ select: { id: true, name: true } }),
  ]);

  const membershipsByUserId = new Map<string, AdminMembershipSummary[]>();

  // Sequential - see listTenantsForAdmin()'s comment on why a concurrent
  // Promise.all over tenants here is avoided.
  for (const tenant of tenants) {
    await withTenantContext(tenant.id, async (tx) => {
      const [tenantMemberships, customerMemberships] = await Promise.all([
        tx.tenantMembership.findMany({ select: { userId: true, role: true, isActive: true } }),
        tx.customerMembership.findMany({
          select: { userId: true, role: true, isActive: true, customer: { select: { name: true } } },
        }),
      ]);

      for (const membership of tenantMemberships) {
        const list = membershipsByUserId.get(membership.userId) ?? [];
        list.push({ type: "TENANT", label: tenant.name, role: membership.role, isActive: membership.isActive });
        membershipsByUserId.set(membership.userId, list);
      }
      for (const membership of customerMemberships) {
        const list = membershipsByUserId.get(membership.userId) ?? [];
        list.push({
          type: "CUSTOMER",
          label: membership.customer.name,
          role: membership.role,
          isActive: membership.isActive,
        });
        membershipsByUserId.set(membership.userId, list);
      }
    });
  }

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    isPlatformAdmin: user.isPlatformAdmin,
    memberships: membershipsByUserId.get(user.id) ?? [],
  }));
}
