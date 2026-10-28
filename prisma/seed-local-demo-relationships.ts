/**
 * Idempotent, local-dev-only script that sets up the demo TradingRelationship
 * matrix (ACTIVE / PENDING-seller-invite / PENDING-buyer-request) between
 * the demo buyers and demo sellers created by
 * prisma/create-local-demo-accounts.ts - see demo-data/local-only/README.md
 * and src/lib/bootstrap/demo-data.ts for the exact dataset.
 *
 * The actual reconciliation logic lives in
 * src/lib/bootstrap/demo-relationship-setup.ts, so
 * prisma/restore-local-demo.ts can reuse it verbatim - this file is just
 * the CLI entry point.
 *
 * Reconciliation, not blind re-invitation (src/lib/bootstrap/demo-relationship-service.ts):
 * for every target in the matrix, the existing TradingRelationship (if
 * any) for that exact buyer+tenant pair is read FIRST. If it already
 * matches the expected target state exactly, this script does nothing for
 * it. If it exists in ANY other state, the script stops immediately with
 * a clear error - it never relinks, reinvites, or overwrites an
 * unexpected existing relationship. Only a genuinely absent relationship
 * is created.
 *
 * Also reconciles, for every ACTIVE relationship only, the linked
 * Customer's price-list assignment against the tenant's standard ("STD")
 * price list, through the existing, already-audited
 * setCustomerPriceListAssignment service - never a raw Prisma write.
 * Deliberately never touches the PENDING seller-invite or PENDING
 * buyer-request targets.
 *
 * Requires prisma/create-local-demo-accounts.ts to have already been run
 * (refuses with a clear message naming the missing tenant/user if not),
 * and requires each tenant's customers.csv/price-lists.csv to have
 * already been imported through the seller UI (refuses with a clear
 * message naming the missing customer code/price list if not) - see the
 * README's import order.
 *
 * No password is read here - nothing new is created credential-wise. Still
 * refuses before any read or write unless connected to exactly
 * "b2b_orders_dev", same as every other local-only operator script in this
 * repo. Does not require an interactive TTY (there is nothing to prompt
 * for), but still refuses to run from a context where DATABASE_URL could
 * plausibly be misconfigured - the database-name guard is the real
 * protection either way.
 */
import "../scripts/load-env";
import { prismaBase } from "../src/lib/db/prisma";
import { assertConnectedToDatabase, WrongTargetDatabaseError } from "../src/lib/bootstrap/target-database-guard";
import { DemoRelationshipInconsistentError } from "../src/lib/bootstrap/demo-relationship-service";
import { DemoSetupPrerequisiteError, reconcileAllDemoRelationships } from "../src/lib/bootstrap/demo-relationship-setup";
import {
  DEMO_ACTIVE_RELATIONSHIPS,
  DEMO_PENDING_BUYER_REQUESTS,
  DEMO_PENDING_SELLER_INVITES,
} from "../src/lib/bootstrap/demo-data";

const REQUIRED_LOCAL_DATABASE_NAME = "b2b_orders_dev";

async function main() {
  console.log("B2B-Orders local demo relationship setup");
  console.log(
    `Reconciles ${DEMO_ACTIVE_RELATIONSHIPS.length} ACTIVE, ${DEMO_PENDING_SELLER_INVITES.length} PENDING ` +
      `seller-invite, and ${DEMO_PENDING_BUYER_REQUESTS.length} PENDING buyer-request relationship(s).\n`
  );

  // First database operation of all, before any lookup or write.
  await assertConnectedToDatabase(prismaBase, REQUIRED_LOCAL_DATABASE_NAME);

  await reconcileAllDemoRelationships();

  console.log("\nDone.");
}

main()
  .catch((err) => {
    if (
      err instanceof WrongTargetDatabaseError ||
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
