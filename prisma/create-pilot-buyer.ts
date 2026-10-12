/**
 * Interactive, TTY-only script that attaches exactly ONE buyer user (and
 * their CustomerMembership) to the EXISTING pilot customer "PILOT-BUYER-001".
 *
 * Deliberately NOT prisma/seed.ts: never imports it, never calls
 * resetDatabase(), and never deletes/migrates/modifies anything else. It
 * only ever creates at most one User row and one CustomerMembership row -
 * see src/lib/bootstrap/pilot-buyer-service.ts for the exact idempotency and
 * refusal rules (already-exists is a clean no-op; an incompatible existing
 * user is a refusal, never a silent overwrite).
 *
 * Must be run interactively by a human operator (`npm run db:create-pilot-buyer`
 * from a real terminal) - it refuses immediately if stdin is not a TTY, and
 * never accepts the password via argv, an environment variable, or a file.
 * Only the resulting bcrypt hash is ever persisted; the plaintext password is
 * never printed, logged, or written anywhere.
 *
 * Runs entirely as b2b_orders_app (via prismaBase / DATABASE_URL) - never
 * the migrator or a superuser, same as prisma/bootstrap-pilot.ts.
 */
import "../scripts/load-env";
import { z } from "zod";
import { prismaBase } from "../src/lib/db/prisma";
import { withTenantContext } from "../src/lib/db/with-tenant";
import { hashPassword } from "../src/lib/auth/password";
import { isInteractiveTTY, readHiddenLine, readVisibleLine } from "../src/lib/bootstrap/hidden-input";
import { validatePassword, passwordsMatch } from "../src/lib/bootstrap/password-policy";
import { createOrReusePilotBuyer, PilotBuyerSetupError } from "../src/lib/bootstrap/pilot-buyer-service";
import { assertConnectedToPilotDatabase, WrongTargetDatabaseError } from "../src/lib/bootstrap/target-database-guard";

const PILOT_CUSTOMER_CODE = "PILOT-BUYER-001";

const emailSchema = z.string().trim().toLowerCase().email("Must be a valid email address.");
const nameSchema = z.string().trim().min(1, "Name must not be empty.");

async function promptValidated<T>(promptText: string, schema: z.ZodSchema<T>): Promise<T> {
  for (;;) {
    const raw = await readVisibleLine(promptText);
    const result = schema.safeParse(raw);
    if (result.success) return result.data;
    process.stdout.write(`  ${result.error.issues[0]?.message ?? "Invalid input."} Try again.\n`);
  }
}

async function promptPassword(): Promise<string> {
  for (;;) {
    const first = await readHiddenLine("Buyer password (input hidden): ");
    const validity = validatePassword(first);
    if (!validity.ok) {
      process.stdout.write(`  ${validity.reason} Try again.\n`);
      continue;
    }
    const second = await readHiddenLine("Confirm password (input hidden): ");
    if (!passwordsMatch(first, second)) {
      process.stdout.write("  Passwords did not match. Try again.\n");
      continue;
    }
    return first;
  }
}

async function main() {
  if (!isInteractiveTTY()) {
    throw new Error(
      "Refusing to run: stdin is not an interactive terminal. This script must be invoked directly by a " +
        "human operator, never piped, redirected, or run from CI/automation."
    );
  }

  process.stdout.write("B2B-Orders pilot buyer setup\n");
  process.stdout.write(`Attaches one buyer user to the existing customer "${PILOT_CUSTOMER_CODE}".\n`);
  process.stdout.write("Never creates, deletes, resets, or migrates anything else.\n\n");

  // First database operation of all, before any customer lookup or write:
  // confirm we are genuinely connected to the Railway pilot database, never
  // trusting DATABASE_URL's text - only what Postgres itself reports. See
  // src/lib/bootstrap/target-database-guard.ts for why this exists.
  await assertConnectedToPilotDatabase(prismaBase);

  // Tenant/User carry no RLS policy (prisma/rls/policies.sql), so this read
  // needs no tenant context - see docs/SESSION_HANDOFF.md's RLS notes.
  const tenants = await prismaBase.tenant.findMany({ select: { id: true, slug: true } });
  if (tenants.length !== 1) {
    throw new Error(
      `Expected exactly one tenant in this database, found ${tenants.length}. Refusing to guess which tenant ` +
        `"${PILOT_CUSTOMER_CODE}" belongs to - this script is only meant for a single-tenant pilot database.`
    );
  }
  const tenant = tenants[0];

  const email = await promptValidated("Buyer email: ", emailSchema);
  const name = await promptValidated("Buyer display name: ", nameSchema);
  const password = await promptPassword();
  const passwordHash = await hashPassword(password);

  const outcome = await withTenantContext(tenant.id, (tx) =>
    createOrReusePilotBuyer(tx, {
      tenantId: tenant.id,
      customerCode: PILOT_CUSTOMER_CODE,
      email,
      name,
      passwordHash,
    })
  );

  process.stdout.write("\n");
  if (outcome.kind === "created") {
    process.stdout.write(`Created new buyer user ${email} and membership on customer "${PILOT_CUSTOMER_CODE}".\n`);
  } else if (outcome.kind === "already-exists") {
    process.stdout.write(
      `Nothing to do: ${email} already has an active membership on customer "${PILOT_CUSTOMER_CODE}". ` +
        "No duplicate was created.\n"
    );
  } else {
    process.stdout.write(
      `Reused the existing user ${email} and added a new membership on customer "${PILOT_CUSTOMER_CODE}".\n` +
        "The password you entered was NOT applied - this user already has their own credentials.\n"
    );
  }
  process.stdout.write(`  Tenant:             ${tenant.slug} (${tenant.id})\n`);
  process.stdout.write(`  User id:            ${outcome.userId}\n`);
  process.stdout.write(`  CustomerMembership: ${outcome.customerMembershipId}\n`);
  process.stdout.write("\nThe password was not stored in plaintext anywhere and is not shown above.\n");
}

main()
  .catch((err) => {
    if (err instanceof PilotBuyerSetupError || err instanceof WrongTargetDatabaseError) {
      process.stderr.write(`\nRefused: ${err.message}\n`);
    } else {
      process.stderr.write(`\nFailed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaBase.$disconnect();
  });
