/**
 * Idempotent, local-dev-only script that creates the six demo seller
 * tenants (+ their Seller Admin accounts) and the five demo buyer User
 * accounts used to exercise the completed multi-seller/multi-buyer
 * workflow - see demo-data/local-only/README.md and
 * src/lib/bootstrap/demo-data.ts for the exact dataset.
 *
 * The actual reconciliation logic (and the shared-password prompt) lives in
 * src/lib/bootstrap/demo-account-setup.ts, so prisma/restore-local-demo.ts
 * can reuse it verbatim - this file is just the CLI entry point.
 *
 * Deliberately does NOT create any CustomerMembership for the demo
 * buyers, and deliberately does NOT reuse createOrReusePilotBuyer (that
 * service creates CustomerMembership directly, which would bypass the
 * TradingRelationship accept invariant). Buyers are created here as bare
 * User rows only - prisma/seed-local-demo-relationships.ts is the only
 * place that ever creates a CustomerMembership, and only through the
 * approved invite/request/accept business flow.
 *
 * Safe to re-run: every tenant/buyer already present is validated against
 * the expected demo identity/structure (src/lib/bootstrap/demo-account-service.ts)
 * before being treated as a clean no-op. Partial or inconsistent local
 * state stops the whole script immediately with a clear, specific error -
 * never silently skipped, never silently "fixed".
 *
 * Must be run interactively (`npm run db:create-local-demo-accounts`) from
 * a real terminal - refuses immediately if stdin is not a TTY. Only ever
 * targets "b2b_orders_dev" (never Railway) - refuses before any read or
 * write otherwise. Prompts for exactly two passwords - one shared across
 * all six demo Seller Admin accounts, one shared across all five demo
 * buyer accounts (deliberately shared, not per-account, so the local demo
 * logins are convenient to use across multiple browsers/devices) - both
 * read hidden and never printed, logged, or written anywhere except as
 * their bcrypt hash.
 */
import "../scripts/load-env";
import { prismaBase } from "../src/lib/db/prisma";
import { hashPassword } from "../src/lib/auth/password";
import { isInteractiveTTY } from "../src/lib/bootstrap/hidden-input";
import { assertConnectedToDatabase, WrongTargetDatabaseError } from "../src/lib/bootstrap/target-database-guard";
import { DemoAccountInconsistentError } from "../src/lib/bootstrap/demo-account-service";
import {
  promptSharedPassword,
  reconcileAllDemoBuyers,
  reconcileAllDemoTenants,
} from "../src/lib/bootstrap/demo-account-setup";
import { DEMO_BUYERS, DEMO_TENANTS } from "../src/lib/bootstrap/demo-data";

const REQUIRED_LOCAL_DATABASE_NAME = "b2b_orders_dev";

async function main() {
  if (!isInteractiveTTY()) {
    throw new Error(
      "Refusing to run: stdin is not an interactive terminal. This script must be invoked directly by a " +
        "human operator, never piped, redirected, or run from CI/automation."
    );
  }

  process.stdout.write("B2B-Orders local demo accounts setup\n");
  process.stdout.write(
    `Creates ${DEMO_TENANTS.length} demo seller tenants (+ Seller Admins) and ${DEMO_BUYERS.length} demo buyer ` +
      "User accounts (no memberships yet - see prisma/seed-local-demo-relationships.ts for that step).\n"
  );
  process.stdout.write("Idempotent: already-correct accounts are skipped; inconsistent ones stop the script.\n\n");

  // First database operation of all, before any lookup or write.
  await assertConnectedToDatabase(prismaBase, REQUIRED_LOCAL_DATABASE_NAME);

  const sellerPassword = await promptSharedPassword("Password for ALL demo Seller Admin accounts");
  const buyerPassword = await promptSharedPassword("Password for ALL demo Buyer accounts");
  const sellerPasswordHash = await hashPassword(sellerPassword);
  const buyerPasswordHash = await hashPassword(buyerPassword);

  process.stdout.write("\nSeller tenants:\n");
  await reconcileAllDemoTenants(sellerPasswordHash);

  process.stdout.write("\nBuyer accounts:\n");
  await reconcileAllDemoBuyers(buyerPasswordHash);

  process.stdout.write("\nDone. Neither password was stored in plaintext anywhere and neither is shown above.\n");
  process.stdout.write("Next: prepare/import the CSV files under demo-data/local-only/, then run " +
    "prisma/seed-local-demo-relationships.ts.\n");
}

main()
  .catch((err) => {
    if (err instanceof WrongTargetDatabaseError || err instanceof DemoAccountInconsistentError) {
      process.stderr.write(`\nRefused: ${err.message}\n`);
    } else {
      process.stderr.write(`\nFailed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaBase.$disconnect();
  });
