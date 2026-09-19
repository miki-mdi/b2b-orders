import { prisma, type ScopedTransactionClient } from "./scoped-client";
import { requireCustomerId, requireTenantId, runWithTenantContext } from "./tenant-context";

/**
 * The entry point seller-side domain services use to run tenant-scoped
 * database work. Combines both enforcement layers from
 * docs/SECURITY_AND_MULTI_TENANCY.md §3:
 *
 *  - Layer 2 (application): sets the AsyncLocalStorage tenant context that
 *    the Prisma extension in ./scoped-client.ts reads to auto-inject
 *    `tenantId` into every query against a tenant-scoped model.
 *  - Layer 3 (database): runs the callback inside ONE Postgres transaction
 *    with `app.current_tenant_id` set via `set_config(..., true)` (the
 *    parameterized equivalent of SET LOCAL), activating the RLS policies in
 *    prisma/rls/policies.sql for that transaction only.
 *
 * Connection-pooling note: SET LOCAL/set_config(local=true) is scoped to the
 * current transaction, and this is an interactive transaction - Prisma holds
 * one physical connection for the whole BEGIN...COMMIT, so this is safe
 * under pooling. See docs/SECURITY_AND_MULTI_TENANCY.md §2 for the one real
 * caveat found during this review (PgBouncer transaction-mode pooling
 * requires disabling Prisma's prepared statements via `?pgbouncer=true` on
 * the connection string - unrelated to SET LOCAL, and not a concern for the
 * local Phase 0 setup, which talks to Postgres directly with no pooler).
 */
export async function withTenantContext<T>(
  tenantId: string | null | undefined,
  fn: (tx: ScopedTransactionClient) => Promise<T>
): Promise<T> {
  const resolvedTenantId = requireTenantId(tenantId);

  return runWithTenantContext({ tenantId: resolvedTenantId }, () =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${resolvedTenantId}, true)`;
      return fn(tx);
    })
  );
}

/**
 * The entry point buyer-side domain services use. Everything above applies,
 * plus a second session variable (`app.current_customer_id`) that narrows
 * every customer-scoped table (see ./tenant-scoped-models.ts) down to one
 * buyer company - so Buyer A can never read Buyer B's rows even though both
 * belong to the same tenant and therefore pass tenant-level RLS.
 */
export async function withCustomerContext<T>(
  tenantId: string | null | undefined,
  customerId: string | null | undefined,
  fn: (tx: ScopedTransactionClient) => Promise<T>
): Promise<T> {
  const resolvedTenantId = requireTenantId(tenantId);
  const resolvedCustomerId = requireCustomerId(customerId);

  return runWithTenantContext({ tenantId: resolvedTenantId, customerId: resolvedCustomerId }, () =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${resolvedTenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_customer_id', ${resolvedCustomerId}, true)`;
      return fn(tx);
    })
  );
}

export { CustomerContextMissingError, TenantContextMissingError } from "./tenant-context";
export { prismaBase } from "./prisma";
