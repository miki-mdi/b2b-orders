/**
 * Fail-closed guard for prisma/create-pilot-buyer.ts: confirms the
 * *connected* database is genuinely the Railway pilot database before any
 * customer lookup or write happens - never trusts DATABASE_URL's text, only
 * what Postgres itself reports for the live connection. This is a second,
 * independent line of defense against the exact .env.local override risk
 * documented in docs/SESSION_HANDOFF.md (scripts/load-env.ts's
 * `override: true` on .env.local can silently replace an operator-set
 * DATABASE_URL with the local dev one) - if that ever happens again, this
 * guard catches it before anything is read or written, not after.
 *
 * SELECT current_database() takes no arguments and returns no secret
 * material - only the bare database name, safe to include in an error
 * message.
 */
export const REQUIRED_PILOT_DATABASE_NAME = "railway";

export class WrongTargetDatabaseError extends Error {}

export type DatabaseNameClient = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

export async function getCurrentDatabaseName(db: DatabaseNameClient): Promise<string> {
  const rows = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  const name = rows[0]?.current_database;
  if (!name) {
    throw new WrongTargetDatabaseError(
      "Could not determine the connected database name (SELECT current_database() returned no rows)."
    );
  }
  return name;
}

/**
 * Generic form, reused by any operator script that must only ever run
 * against one specific, named database (e.g.
 * prisma/reset-local-seller-password.ts requiring "b2b_orders_dev" - the
 * exact opposite direction from the pilot guard below, same mechanism).
 */
export async function assertConnectedToDatabase(db: DatabaseNameClient, expectedName: string): Promise<void> {
  const name = await getCurrentDatabaseName(db);
  if (name !== expectedName) {
    throw new WrongTargetDatabaseError(
      `Refusing to run: the connected database is "${name}", but this script only ever targets "${expectedName}". ` +
        "Fix the environment and re-run. No write was attempted."
    );
  }
}

export async function assertConnectedToPilotDatabase(db: DatabaseNameClient): Promise<void> {
  const name = await getCurrentDatabaseName(db);
  if (name !== REQUIRED_PILOT_DATABASE_NAME) {
    throw new WrongTargetDatabaseError(
      `Refusing to run: the connected database is "${name}", but this script only ever targets the Railway ` +
        `pilot database "${REQUIRED_PILOT_DATABASE_NAME}". This most likely means DATABASE_URL is pointing at ` +
        'local dev ("b2b_orders_dev") or somewhere else - fix the environment and re-run. ' +
        "No customer lookup or write was attempted."
    );
  }
}
