// The atomic core of pilot bootstrap: acquire an advisory lock, re-verify
// preconditions inside it, then create exactly one Tenant + User +
// SELLER_ADMIN TenantMembership - all inside one Prisma interactive
// transaction, so any failure anywhere leaves zero rows behind.
import { prismaBase } from "../db/prisma";
import { checkBootstrapPreconditions } from "./preconditions";

export type BootstrapTxClient = Parameters<Parameters<(typeof prismaBase)["$transaction"]>[0]>[0];

/**
 * Fixed, documented, arbitrary advisory-lock key pair, unique to this one
 * operation. No other advisory-lock use exists anywhere in this codebase
 * (verified by a repo-wide search) - if one is ever added elsewhere, it must
 * pick a different key pair to avoid an unrelated collision.
 */
export const BOOTSTRAP_ADVISORY_LOCK_KEYS: readonly [number, number] = [872315, 1];

/**
 * Bounds how long this transaction will wait to acquire the advisory lock -
 * an accidentally concurrent hung bootstrap (or any other process that
 * somehow acquired this key and never released it) cannot block a second
 * run indefinitely. Postgres raises a lock_timeout error past this bound,
 * which surfaces as a thrown exception and rolls back cleanly like any other
 * failure in this transaction. A literal constant, never user input, so
 * $executeRawUnsafe is safe here (SET does not support bind parameters at
 * all in Postgres - this is not something $executeRaw's tagged template
 * could parameterize even if we wanted to).
 */
const LOCK_TIMEOUT = "10s";

/** Overall transaction budget - generous enough to comfortably exceed
 * LOCK_TIMEOUT plus the handful of ordinary inserts that follow it. */
const TRANSACTION_TIMEOUT_MS = 20_000;
const TRANSACTION_MAX_WAIT_MS = 5_000;

export async function acquireBootstrapLock(tx: BootstrapTxClient): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOTSTRAP_ADVISORY_LOCK_KEYS[0]}, ${BOOTSTRAP_ADVISORY_LOCK_KEYS[1]})`;
}

export type BootstrapInput = {
  tenantName: string;
  tenantSlug: string;
  defaultVatRate: string;
  adminEmail: string;
  adminName: string;
  passwordHash: string;
};

export type BootstrapResult = {
  tenantId: string;
  userId: string;
  tenantMembershipId: string;
};

/**
 * The three creates only - no lock, no precondition check. Exported
 * separately so tests can induce a failure at the membership-insert step
 * (via `roleOverrideForTesting`, a deliberately invalid enum value that
 * Postgres itself rejects) and prove the whole transaction rolls back,
 * without needing to fake a real concurrency scenario to exercise the
 * atomicity guarantee.
 */
export async function createTenantAdminAtomically(
  tx: BootstrapTxClient,
  input: BootstrapInput,
  roleOverrideForTesting?: string
): Promise<BootstrapResult> {
  const tenant = await tx.tenant.create({
    data: {
      name: input.tenantName,
      slug: input.tenantSlug,
      defaultVatRate: input.defaultVatRate,
    },
  });

  const admin = await tx.user.create({
    data: {
      email: input.adminEmail,
      passwordHash: input.passwordHash,
      name: input.adminName,
    },
  });

  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`;

  const role = roleOverrideForTesting ?? "SELLER_ADMIN";
  const membership = await tx.tenantMembership.create({
    data: {
      userId: admin.id,
      tenantId: tenant.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only escape hatch to induce a real DB-level enum rejection
      role: role as any,
    },
  });

  return { tenantId: tenant.id, userId: admin.id, tenantMembershipId: membership.id };
}

/**
 * Full sequence E-L: open one transaction, acquire the advisory lock,
 * re-verify preconditions inside it (closing the TOCTOU gap against any
 * pre-flight check that ran before the transaction opened), then create the
 * three rows. Any throw anywhere - the lock timing out, a precondition
 * failing, a DB-level constraint violation on any of the three creates -
 * rolls back the entire transaction, releasing the advisory lock as part of
 * that rollback. Nothing partial is ever left behind.
 */
export async function bootstrapPilotTenant(
  db: typeof prismaBase,
  migrationsDir: string,
  input: BootstrapInput,
  roleOverrideForTesting?: string
): Promise<BootstrapResult> {
  return db.$transaction(
    async (tx) => {
      await acquireBootstrapLock(tx);
      await checkBootstrapPreconditions(tx, migrationsDir);
      return createTenantAdminAtomically(tx, input, roleOverrideForTesting);
    },
    { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS }
  );
}
