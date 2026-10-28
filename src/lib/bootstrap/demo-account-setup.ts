/**
 * I/O orchestration for the demo tenant/buyer account matrix - split out of
 * prisma/create-local-demo-accounts.ts so prisma/restore-local-demo.ts can
 * reuse the exact same reconciliation logic (never a second copy of the
 * same business rules). The pure accept/reject decisions themselves live in
 * demo-account-service.ts; this file is only the prismaBase reads/writes
 * and console output around those decisions.
 *
 * Deliberately does NOT create any CustomerMembership for the demo buyers -
 * see create-local-demo-accounts.ts's header comment for why (unchanged by
 * this refactor).
 */
import { prismaBase } from "@/lib/db/prisma";
import { readHiddenLine } from "@/lib/bootstrap/hidden-input";
import { validatePassword, passwordsMatch } from "@/lib/bootstrap/password-policy";
import { createTenantAdminAtomically } from "@/lib/bootstrap/bootstrap-service";
import { reconcileDemoBuyerState, reconcileDemoTenantState } from "@/lib/bootstrap/demo-account-service";
import { DEMO_BUYERS, DEMO_TENANTS, type DemoBuyerSpec, type DemoTenantSpec } from "@/lib/bootstrap/demo-data";

export async function promptSharedPassword(label: string): Promise<string> {
  for (;;) {
    const first = await readHiddenLine(`${label} (input hidden): `);
    const validity = validatePassword(first);
    if (!validity.ok) {
      process.stdout.write(`  ${validity.reason} Try again.\n`);
      continue;
    }
    const second = await readHiddenLine(`Confirm ${label.toLowerCase()} (input hidden): `);
    if (!passwordsMatch(first, second)) {
      process.stdout.write("  Passwords did not match. Try again.\n");
      continue;
    }
    return first;
  }
}

async function reconcileDemoTenant(spec: DemoTenantSpec, adminPasswordHash: string): Promise<void> {
  const label = `Tenant "${spec.slug}"`;
  const existingTenant = await prismaBase.tenant.findUnique({ where: { slug: spec.slug } });
  const existingAdminUser = existingTenant ? await prismaBase.user.findUnique({ where: { email: spec.adminEmail } }) : null;
  const existingMembership =
    existingTenant && existingAdminUser
      ? await prismaBase.tenantMembership.findUnique({
          where: { userId_tenantId: { userId: existingAdminUser.id, tenantId: existingTenant.id } },
        })
      : null;

  const decision = reconcileDemoTenantState({
    existingTenant,
    existingAdminUser,
    existingMembership,
    expectedName: spec.name,
    label,
  });

  if (decision.action === "skip") {
    process.stdout.write(`  ${label} already exists and matches - skipping.\n`);
    return;
  }

  await prismaBase.$transaction((tx) =>
    createTenantAdminAtomically(tx, {
      tenantName: spec.name,
      tenantSlug: spec.slug,
      defaultVatRate: spec.defaultVatRate,
      adminEmail: spec.adminEmail,
      adminName: spec.adminName,
      passwordHash: adminPasswordHash,
    })
  );
  process.stdout.write(`  Created ${label} ("${spec.name}") with Seller Admin ${spec.adminEmail}.\n`);
}

async function reconcileDemoBuyer(spec: DemoBuyerSpec, buyerPasswordHash: string): Promise<void> {
  const label = `Buyer "${spec.email}"`;
  const existingUser = await prismaBase.user.findUnique({ where: { email: spec.email } });

  const decision = reconcileDemoBuyerState({ existingUser, expectedName: spec.name, label });

  if (decision.action === "skip") {
    process.stdout.write(`  ${label} already exists and matches - skipping.\n`);
    return;
  }

  await prismaBase.user.create({
    data: { email: spec.email, name: spec.name, passwordHash: buyerPasswordHash },
  });
  process.stdout.write(`  Created ${label} (User only - no membership yet).\n`);
}

export async function reconcileAllDemoTenants(adminPasswordHash: string): Promise<void> {
  for (const spec of DEMO_TENANTS) {
    await reconcileDemoTenant(spec, adminPasswordHash);
  }
}

export async function reconcileAllDemoBuyers(buyerPasswordHash: string): Promise<void> {
  for (const spec of DEMO_BUYERS) {
    await reconcileDemoBuyer(spec, buyerPasswordHash);
  }
}
