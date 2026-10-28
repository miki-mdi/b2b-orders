/**
 * Idempotent, local-dev-only, non-destructive "restore the whole demo
 * environment in one command" script - for recovering after something
 * (most notably: running the full `npx vitest run` suite, which shares
 * b2b_orders_dev with the app and resets it in most test files' own
 * beforeAll - see vitest.config.mts's comment and
 * demo-data/local-only/README.md's warning) wipes the local dev database.
 *
 * Composes the exact same, already-audited reconciliation logic as the
 * three individual steps - never a second copy of the same business rules,
 * and never a raw Prisma write:
 *   1. src/lib/bootstrap/demo-account-setup.ts   (tenants + Seller Admins + buyer Users)
 *   2. src/lib/bootstrap/demo-csv-import.ts      (all 48 CSVs, via the seller UI's own confirmImport)
 *   3. src/lib/bootstrap/demo-relationship-setup.ts (TradingRelationships + STD price-list assignment)
 *
 * Never resets, truncates, or deletes anything - no resetDatabase, no
 * deleteMany, nothing that could touch formula-export or any other
 * unrelated local data. Every step above is itself idempotent (an
 * already-correct record is skipped; an inconsistent one stops the whole
 * script with a clear message before any further write) - safe to re-run,
 * including after this script itself was interrupted partway through.
 *
 * Preflights all 48 expected CSV files (existence + header match against
 * src/lib/domain/import/templates.ts) BEFORE any database read or write at
 * all, including before the password prompts - a missing/malformed CSV
 * file is caught immediately, not after tenants/buyers already exist.
 *
 * Must be run interactively (`npm run db:restore-local-demo`) - refuses if
 * stdin is not a TTY, same as prisma/create-local-demo-accounts.ts.
 * Refuses before any read or write unless connected to exactly
 * "b2b_orders_dev", same as every other local-only operator script in this
 * repo. Prompts for the same two shared passwords
 * (Seller Admin / Buyer) as prisma/create-local-demo-accounts.ts - never
 * printed, logged, or stored anywhere except as a bcrypt hash.
 *
 * The three individual scripts (db:create-local-demo-accounts,
 * db:seed-local-demo-relationships) still exist unchanged for running one
 * step at a time; this script is only a convenience that chains all three
 * plus the CSV import step together.
 */
import "../scripts/load-env";
import { prismaBase } from "../src/lib/db/prisma";
import { hashPassword } from "../src/lib/auth/password";
import { isInteractiveTTY } from "../src/lib/bootstrap/hidden-input";
import { assertConnectedToDatabase, WrongTargetDatabaseError } from "../src/lib/bootstrap/target-database-guard";
import { DemoAccountInconsistentError } from "../src/lib/bootstrap/demo-account-service";
import { DemoRelationshipInconsistentError } from "../src/lib/bootstrap/demo-relationship-service";
import {
  promptSharedPassword,
  reconcileAllDemoBuyers,
  reconcileAllDemoTenants,
} from "../src/lib/bootstrap/demo-account-setup";
import { DemoSetupPrerequisiteError, reconcileAllDemoRelationships } from "../src/lib/bootstrap/demo-relationship-setup";
import { DemoCsvPreflightError, importAllDemoCsvFiles, preflightDemoCsvFiles } from "../src/lib/bootstrap/demo-csv-import";
import { DEMO_BUYERS, DEMO_TENANTS } from "../src/lib/bootstrap/demo-data";

const REQUIRED_LOCAL_DATABASE_NAME = "b2b_orders_dev";

async function main() {
  if (!isInteractiveTTY()) {
    throw new Error(
      "Refusing to run: stdin is not an interactive terminal. This script must be invoked directly by a " +
        "human operator, never piped, redirected, or run from CI/automation."
    );
  }

  console.log("B2B-Orders local demo environment restore");
  console.log(
    "Non-destructive: never resets, truncates, or deletes anything - only creates/reconciles the " +
      `${DEMO_TENANTS.length} demo seller tenants, ${DEMO_BUYERS.length} demo buyer accounts, their CSV-imported ` +
      "catalog data, and the demo relationship matrix. Safe to re-run, including after an interrupted run.\n"
  );

  // First database operation of all, before any read or write.
  await assertConnectedToDatabase(prismaBase, REQUIRED_LOCAL_DATABASE_NAME);

  console.log("Preflighting demo CSV files (existence + header check, before any write)...");
  await preflightDemoCsvFiles();
  console.log(`  All ${DEMO_TENANTS.length * 8} expected CSV files found with matching headers.\n`);

  const sellerPassword = await promptSharedPassword("Password for ALL demo Seller Admin accounts");
  const buyerPassword = await promptSharedPassword("Password for ALL demo Buyer accounts");
  const sellerPasswordHash = await hashPassword(sellerPassword);
  const buyerPasswordHash = await hashPassword(buyerPassword);

  console.log("\nSeller tenants:");
  await reconcileAllDemoTenants(sellerPasswordHash);

  console.log("\nBuyer accounts:");
  await reconcileAllDemoBuyers(buyerPasswordHash);

  console.log("\nImporting demo catalog CSVs:");
  await importAllDemoCsvFiles();

  console.log("\nDemo relationships (+ standard price-list assignment for ACTIVE pairs):");
  await reconcileAllDemoRelationships();

  console.log("\nRestore complete. Neither password was stored in plaintext anywhere and neither is shown above.");
}

main()
  .catch((err) => {
    if (
      err instanceof WrongTargetDatabaseError ||
      err instanceof DemoAccountInconsistentError ||
      err instanceof DemoCsvPreflightError ||
      err instanceof DemoSetupPrerequisiteError ||
      err instanceof DemoRelationshipInconsistentError
    ) {
      console.error(`\nRefused: ${err.message}`);
    } else {
      console.error(`\nFailed: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaBase.$disconnect();
  });
