/**
 * One-time, additive-only pilot bootstrap: creates exactly one Tenant, one
 * Seller Admin User, and one SELLER_ADMIN TenantMembership, atomically.
 *
 * Deliberately NOT prisma/seed.ts: that script's resetDatabase() wipes every
 * table and is for local dev/test only - see docs/SESSION_HANDOFF.md and
 * this script's own precondition checks, which refuse to run against any
 * database that already has a Tenant or User row.
 *
 * Must be run interactively by a human operator (`npm run db:bootstrap-pilot`
 * from a real terminal) - it refuses immediately if stdin is not a TTY, and
 * never accepts the admin password via argv, an environment variable, or a
 * file. Only the resulting bcrypt hash is ever persisted; the plaintext
 * password is never printed, logged, or written anywhere.
 *
 * Runs entirely as b2b_orders_app (via prismaBase / DATABASE_URL) - never
 * the migrator or a superuser. See src/lib/bootstrap/bootstrap-service.ts
 * for the atomic transaction/advisory-lock design this orchestrates.
 */
import "./scripts/load-env";
import path from "node:path";
import { z } from "zod";
import { prismaBase } from "../src/lib/db/prisma";
import { hashPassword } from "../src/lib/auth/password";
import { isInteractiveTTY, readHiddenLine, readVisibleLine } from "../src/lib/bootstrap/hidden-input";
import { validatePassword, passwordsMatch } from "../src/lib/bootstrap/password-policy";
import { checkBootstrapPreconditions, BootstrapPreconditionError } from "../src/lib/bootstrap/preconditions";
import { bootstrapPilotTenant } from "../src/lib/bootstrap/bootstrap-service";

// cwd-relative, matching prisma.config.ts's own "prisma/schema.prisma" and
// this project's convention of every npm script running from the repo root.
const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

const tenantNameSchema = z.string().trim().min(1, "Tenant name must not be empty.");
const tenantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Slug must be lowercase alphanumeric with hyphens only (e.g. \"acme-foods\").");
const vatRateSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "VAT rate must be a plain decimal number, e.g. 18 or 18.00.");
const adminEmailSchema = z.string().trim().toLowerCase().email("Must be a valid email address.");
const adminNameSchema = z.string().trim().min(1, "Admin name must not be empty.");

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
    const first = await readHiddenLine("Seller Admin password (input hidden): ");
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
      "Bootstrap requires an interactive terminal (stdin is not a TTY). " +
        "Refusing to run - this script must be invoked directly by a human operator, " +
        "never piped, redirected, or run from CI/automation."
    );
  }

  process.stdout.write("B2B-Orders pilot bootstrap\n");
  process.stdout.write("This creates exactly one Tenant, one Seller Admin user, and their membership.\n");
  process.stdout.write("It refuses to run if the database is not empty or not fully migrated.\n\n");

  // B: optional fast preflight, outside any transaction - fails cheaply and
  // quickly for the common "already initialized" case before we even bother
  // prompting the operator for anything.
  await checkBootstrapPreconditions(prismaBase, MIGRATIONS_DIR);

  const tenantName = await promptValidated("Tenant name: ", tenantNameSchema);
  const tenantSlug = await promptValidated("Tenant slug (lowercase, hyphenated): ", tenantSlugSchema);
  const defaultVatRate = await promptValidated("Default VAT rate (e.g. 18): ", vatRateSchema);
  const adminEmail = await promptValidated("Seller Admin email: ", adminEmailSchema);
  const adminName = await promptValidated("Seller Admin name: ", adminNameSchema);
  const password = await promptPassword();

  const passwordHash = await hashPassword(password);

  const result = await bootstrapPilotTenant(prismaBase, MIGRATIONS_DIR, {
    tenantName,
    tenantSlug,
    defaultVatRate,
    adminEmail,
    adminName,
    passwordHash,
  });

  process.stdout.write("\nBootstrap complete.\n");
  process.stdout.write(`  Tenant:           ${tenantName} (${result.tenantId})\n`);
  process.stdout.write(`  Seller Admin:     ${adminEmail} (${result.userId})\n`);
  process.stdout.write(`  TenantMembership: ${result.tenantMembershipId}\n`);
  process.stdout.write("\nThe password was not stored in plaintext anywhere and is not shown above.\n");
}

main()
  .catch((err) => {
    if (err instanceof BootstrapPreconditionError) {
      process.stderr.write(`\nBootstrap refused: ${err.message}\n`);
    } else {
      process.stderr.write(`\nBootstrap failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaBase.$disconnect();
  });
