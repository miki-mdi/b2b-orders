/**
 * Interactive, TTY-only script that resets the password for the existing
 * seeded local-dev Seller Admin account ("seller-admin@alpha.test") -
 * LOCAL DEV ONLY. Refuses before any write unless the connected database
 * is exactly "b2b_orders_dev" - never Railway, never any other database,
 * same fail-closed mechanism as prisma/create-pilot-buyer.ts's pilot
 * guard, just pointed at the opposite target.
 *
 * Never imports prisma/seed.ts, never calls resetDatabase(), never runs a
 * migration - it only ever updates this one existing user's passwordHash
 * column. Refuses with a clear message (never creates the account) if
 * that user doesn't exist.
 *
 * Must be run interactively (`npm run db:reset-local-seller-password`
 * from a real terminal) - refuses immediately if stdin is not a TTY, and
 * never accepts the password via argv, an environment variable, or a
 * file. Only the resulting bcrypt hash is ever persisted; the plaintext
 * password is never printed, logged, or written anywhere.
 *
 * Runs entirely as b2b_orders_app (via prismaBase / DATABASE_URL) - User
 * carries no RLS policy (see prisma/rls/policies.sql), same as every
 * other operator script in this repo.
 */
import "../scripts/load-env";
import { prismaBase } from "../src/lib/db/prisma";
import { hashPassword } from "../src/lib/auth/password";
import { isInteractiveTTY, readHiddenLine } from "../src/lib/bootstrap/hidden-input";
import { validatePassword, passwordsMatch } from "../src/lib/bootstrap/password-policy";
import { assertConnectedToDatabase, WrongTargetDatabaseError } from "../src/lib/bootstrap/target-database-guard";
import { resetSellerPassword, ResetSellerPasswordError } from "../src/lib/bootstrap/reset-seller-password-service";

const TARGET_EMAIL = "seller-admin@alpha.test";
const REQUIRED_LOCAL_DATABASE_NAME = "b2b_orders_dev";

async function promptPassword(): Promise<string> {
  for (;;) {
    const first = await readHiddenLine("New password (input hidden): ");
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

  process.stdout.write("B2B-Orders local Seller Admin password reset\n");
  process.stdout.write(`Resets the password for the existing local user "${TARGET_EMAIL}" only.\n`);
  process.stdout.write("Never creates, deletes, seeds, or migrates anything.\n\n");

  // First database operation of all, before any lookup or write.
  await assertConnectedToDatabase(prismaBase, REQUIRED_LOCAL_DATABASE_NAME);

  const password = await promptPassword();
  const passwordHash = await hashPassword(password);

  const result = await resetSellerPassword(prismaBase, TARGET_EMAIL, passwordHash);

  process.stdout.write("\nPassword reset.\n");
  process.stdout.write(`  User: ${result.email} (${result.userId})\n`);
  process.stdout.write("\nThe password was not stored in plaintext anywhere and is not shown above.\n");
}

main()
  .catch((err) => {
    if (err instanceof WrongTargetDatabaseError || err instanceof ResetSellerPasswordError) {
      process.stderr.write(`\nRefused: ${err.message}\n`);
    } else {
      process.stderr.write(`\nFailed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaBase.$disconnect();
  });
