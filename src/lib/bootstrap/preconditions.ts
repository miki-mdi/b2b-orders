// Fail-closed precondition checks for pilot bootstrap. Deliberately does NOT
// use TenantMembership.count() as evidence of emptiness: TenantMembership
// carries FORCE ROW LEVEL SECURITY (prisma/rls/policies.sql), so an unscoped
// count from a non-owner, non-BYPASSRLS role (b2b_orders_app - the role this
// script always runs as) would be silently filtered by RLS to zero
// regardless of what actually exists, which proves nothing.
//
// Instead this relies on the schema's actual foreign-key structure:
// TenantMembership.tenantId and .userId are both required (NOT NULL) FKs to
// Tenant/User (prisma/schema.prisma's TenantMembership model) - a
// TenantMembership row cannot exist without a real Tenant and User row to
// reference, a guarantee enforced by Postgres itself, independent of RLS.
// Every other tenant-scoped table chains back to Tenant the same way (see
// prisma/rls/policies.sql's own "REQUIRED for every scoped table" header
// comment), so Tenant.count() === 0 transitively proves the entire
// tenant-scoped subtree is empty. User is not reachable from Tenant and
// carries no RLS policy of its own, so it is checked directly and reliably.
import { getRepoMigrationNames, diffMigrationState, isMigrationDiffClean, describeMigrationDiff } from "./migration-check";

/**
 * The minimal shape these checks need - deliberately structural rather than
 * naming a concrete Prisma client/transaction-client type, so the same
 * checks work identically whether called on the plain `prismaBase` (the
 * pre-flight check, outside any transaction) or on the transaction client
 * Prisma hands to a `$transaction(async (tx) => ...)` callback (the
 * authoritative in-transaction recheck) - see bootstrap-service.ts.
 */
type QueryableClient = {
  user: { count: () => Promise<number> };
  tenant: { count: () => Promise<number> };
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

export class BootstrapPreconditionError extends Error {}

export async function checkRootStateIsEmpty(db: QueryableClient): Promise<void> {
  const [userCount, tenantCount] = await Promise.all([db.user.count(), db.tenant.count()]);
  if (userCount > 0 || tenantCount > 0) {
    throw new BootstrapPreconditionError(
      `Refusing to bootstrap: database is not empty (User count=${userCount}, Tenant count=${tenantCount}, expected 0/0). ` +
        "This pilot database appears to already be initialized."
    );
  }
}

export async function checkMigrationsMatchRepo(db: QueryableClient, migrationsDir: string): Promise<void> {
  const repoNames = getRepoMigrationNames(migrationsDir);
  const dbRows = await db.$queryRaw<
    { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
  >`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;

  const diff = diffMigrationState(repoNames, dbRows);
  if (!isMigrationDiffClean(diff)) {
    throw new BootstrapPreconditionError(
      `Refusing to bootstrap: migration state mismatch.\n${describeMigrationDiff(diff)}`
    );
  }
}

export async function checkBootstrapPreconditions(db: QueryableClient, migrationsDir: string): Promise<void> {
  await checkMigrationsMatchRepo(db, migrationsDir);
  await checkRootStateIsEmpty(db);
}
