import type { Prisma } from "@prisma/client";
import { prismaBase } from "./prisma";
import { requireUserId } from "./tenant-context";

/**
 * The ONLY sanctioned way to query TenantMembership/CustomerMembership
 * before a tenant/customer context is known - i.e. the membership-discovery
 * step of authentication (src/lib/auth/active-membership.ts), where the
 * whole point of the query is to find out which tenant(s)/customer(s) a
 * user belongs to.
 *
 * This deliberately bypasses Layer 2 (the tenant-scoped Prisma extension in
 * ./scoped-client.ts) - there is no tenantId to inject yet - and instead
 * relies on the read-only RLS exemption added specifically for this case:
 * TenantMembership/CustomerMembership's SELECT policy allows a row where
 * `"userId" = current_setting('app.current_user_id', true)`, in addition to
 * the normal tenant/customer match. That exemption is SELECT-only - the
 * INSERT/UPDATE/DELETE policies on both tables still require an actual
 * tenant (and, for CustomerMembership, matching customer) context, so
 * `app.current_user_id` alone can never create, modify, or delete a
 * membership. See prisma/rls/policies.sql for the exact policies and
 * docs/SECURITY_AND_MULTI_TENANCY.md for the write-up of why this exists.
 *
 * Do not set `app.current_user_id` ad hoc elsewhere - route every such
 * lookup through this one helper so the exemption has a single, auditable
 * call site.
 */
export async function withUserContext<T>(
  userId: string | null | undefined,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const resolvedUserId = requireUserId(userId);

  return prismaBase.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${resolvedUserId}, true)`;
    return fn(tx);
  });
}

export { UserContextMissingError } from "./tenant-context";
