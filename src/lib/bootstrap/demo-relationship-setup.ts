/**
 * I/O orchestration for the demo TradingRelationship matrix (ACTIVE /
 * PENDING-seller-invite / PENDING-buyer-request) plus each ACTIVE pair's
 * standard price-list assignment - split out of
 * prisma/seed-local-demo-relationships.ts so prisma/restore-local-demo.ts
 * can reuse the exact same reconciliation logic (never a second copy of
 * the same business rules). The pure accept/reject decisions themselves
 * live in demo-relationship-service.ts; this file is only the prismaBase
 * reads, the real domain-service calls, and the console output around
 * those decisions.
 *
 * Deliberately uses ONLY the established, already-audited domain services
 * (inviteBuyerForCustomer, acceptInvitation, requestConnection,
 * setCustomerPriceListAssignment) - never a raw Prisma write - so every
 * CustomerMembership/CustomerPriceListAssignment this ever causes to exist
 * is created exclusively through the approved business flow, with its
 * normal audit trail.
 */
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import {
  reconcileActiveRelationshipState,
  reconcilePendingBuyerRequestState,
  reconcilePendingSellerInviteState,
  reconcilePriceListAssignmentState,
} from "@/lib/bootstrap/demo-relationship-service";
import {
  DEMO_ACTIVE_RELATIONSHIPS,
  DEMO_PENDING_BUYER_REQUESTS,
  DEMO_PENDING_SELLER_INVITES,
  DEMO_STANDARD_PRICE_LIST_CODE,
  DEMO_TENANTS,
  type DemoActiveRelationship,
  type DemoPendingBuyerRequest,
  type DemoPendingSellerInvite,
} from "@/lib/bootstrap/demo-data";
import {
  acceptInvitation,
  inviteBuyerForCustomer,
  requestConnection,
} from "@/lib/domain/trading-relationships/trading-relationship-service";
import {
  getCustomerPriceListAssignment,
  setCustomerPriceListAssignment,
} from "@/lib/domain/customers/customer-price-list-assignment-service";

export class DemoSetupPrerequisiteError extends Error {}

async function requireTenant(slug: string): Promise<{ id: string } & Record<string, unknown>> {
  const tenant = await prismaBase.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    throw new DemoSetupPrerequisiteError(
      `No tenant with slug "${slug}" found. Run prisma/create-local-demo-accounts.ts first.`
    );
  }
  return tenant;
}

async function requireBuyerUser(email: string): Promise<{ id: string }> {
  const user = await prismaBase.user.findUnique({ where: { email } });
  if (!user) {
    throw new DemoSetupPrerequisiteError(
      `No user with email "${email}" found. Run prisma/create-local-demo-accounts.ts first.`
    );
  }
  return user;
}

/** A tenant's own Seller Admin acts as the inviting actor for that tenant's invitations - found via its known demo admin email, never guessed. */
async function requireTenantAdminUser(tenantSlug: string): Promise<{ id: string }> {
  const spec = DEMO_TENANTS.find((t) => t.slug === tenantSlug);
  if (!spec) {
    throw new DemoSetupPrerequisiteError(`"${tenantSlug}" is not one of the known demo tenants in demo-data.ts.`);
  }
  return requireBuyerUser(spec.adminEmail);
}

async function requireCustomer(tenantId: string, code: string, label: string): Promise<{ id: string }> {
  const customer = await withTenantContext(tenantId, (tx) => tx.customer.findUnique({ where: { tenantId_code: { tenantId, code } } }));
  if (!customer) {
    throw new DemoSetupPrerequisiteError(
      `${label}: no Customer with code "${code}" found for this tenant. Import that tenant's customers.csv ` +
        "through the seller UI first - see demo-data/local-only/README.md's import order."
    );
  }
  return customer;
}

async function findExistingRelationship(userId: string, tenantId: string) {
  return withTenantContext(tenantId, (tx) =>
    tx.tradingRelationship.findUnique({ where: { userId_tenantId: { userId, tenantId } } })
  );
}

async function requireActivePriceList(tenantId: string, code: string, label: string): Promise<{ id: string }> {
  const priceList = await withTenantContext(tenantId, (tx) => tx.priceList.findUnique({ where: { tenantId_code: { tenantId, code } } }));
  if (!priceList) {
    throw new DemoSetupPrerequisiteError(
      `${label}: no PriceList with code "${code}" found for this tenant. Import that tenant's price-lists.csv ` +
        "through the seller UI first - see demo-data/local-only/README.md's import order."
    );
  }
  if (!priceList.isActive) {
    throw new DemoSetupPrerequisiteError(
      `${label}: the tenant's "${code}" price list exists but is not active. Refusing to assign an inactive ` +
        "price list - reactivate it or fix the imported data first."
    );
  }
  return priceList;
}

async function ensureStandardPriceListAssigned(
  tenantId: string,
  tenantSlug: string,
  customerId: string,
  label: string
): Promise<void> {
  const priceList = await requireActivePriceList(tenantId, DEMO_STANDARD_PRICE_LIST_CODE, label);
  const existingAssignment = await getCustomerPriceListAssignment(tenantId, customerId);
  const decision = reconcilePriceListAssignmentState({
    existingPriceListId: existingAssignment?.priceListId ?? null,
    expectedPriceListId: priceList.id,
    label,
  });

  if (decision.action === "skip") {
    console.log(`  ${label}: price list "${DEMO_STANDARD_PRICE_LIST_CODE}" already assigned - skipping.`);
    return;
  }

  const sellerAdmin = await requireTenantAdminUser(tenantSlug);
  await setCustomerPriceListAssignment(tenantId, sellerAdmin.id, customerId, priceList.id);
  console.log(`  ${label}: assigned price list "${DEMO_STANDARD_PRICE_LIST_CODE}".`);
}

async function setUpActiveRelationship(target: DemoActiveRelationship): Promise<void> {
  const label = `ACTIVE ${target.buyerEmail} @ ${target.tenantSlug}`;
  const tenant = await requireTenant(target.tenantSlug);
  const buyer = await requireBuyerUser(target.buyerEmail);
  const customer = await requireCustomer(tenant.id, target.customerCode, label);

  const existing = await findExistingRelationship(buyer.id, tenant.id);
  const decision = reconcileActiveRelationshipState({ existing, expectedCustomerId: customer.id, label });

  if (decision.action === "skip") {
    console.log(`  ${label}: already ACTIVE as expected - skipping.`);
  } else {
    const sellerAdmin = await requireTenantAdminUser(target.tenantSlug);
    const invited = await inviteBuyerForCustomer(tenant.id, sellerAdmin.id, customer.id, target.buyerEmail);
    await acceptInvitation(buyer.id, invited.relationship.id);
    console.log(`  ${label}: created and accepted - now ACTIVE.`);
  }

  await ensureStandardPriceListAssigned(tenant.id, target.tenantSlug, customer.id, label);
}

async function setUpPendingSellerInvite(target: DemoPendingSellerInvite): Promise<void> {
  const label = `PENDING seller-invite ${target.buyerEmail} @ ${target.tenantSlug}`;
  const tenant = await requireTenant(target.tenantSlug);
  const buyer = await requireBuyerUser(target.buyerEmail);
  const customer = await requireCustomer(tenant.id, target.customerCode, label);

  const existing = await findExistingRelationship(buyer.id, tenant.id);
  const decision = reconcilePendingSellerInviteState({ existing, expectedCustomerId: customer.id, label });

  if (decision.action === "skip") {
    console.log(`  ${label}: already PENDING as expected - skipping.`);
    return;
  }

  const sellerAdmin = await requireTenantAdminUser(target.tenantSlug);
  await inviteBuyerForCustomer(tenant.id, sellerAdmin.id, customer.id, target.buyerEmail);
  console.log(`  ${label}: invitation sent (PENDING, not accepted).`);
}

async function setUpPendingBuyerRequest(target: DemoPendingBuyerRequest): Promise<void> {
  const label = `PENDING buyer-request ${target.buyerEmail} -> ${target.tenantSlug}`;
  const tenant = await requireTenant(target.tenantSlug);
  const buyer = await requireBuyerUser(target.buyerEmail);

  const existing = await findExistingRelationship(buyer.id, tenant.id);
  const decision = reconcilePendingBuyerRequestState({ existing, label });

  if (decision.action === "skip") {
    console.log(`  ${label}: already PENDING as expected - skipping.`);
    return;
  }

  await requestConnection(buyer.id, tenant.id);
  console.log(`  ${label}: request sent (PENDING, not approved).`);
}

/**
 * Reconciles every ACTIVE relationship (+ its Customer's standard price-list
 * assignment), every PENDING seller-invite, and every PENDING buyer-request
 * in src/lib/bootstrap/demo-data.ts, in that order. Safe to re-run: each
 * target is independently idempotent (see the reconcile*State pure
 * functions in demo-relationship-service.ts).
 */
export async function reconcileAllDemoRelationships(): Promise<void> {
  console.log("Active relationships:");
  for (const target of DEMO_ACTIVE_RELATIONSHIPS) {
    await setUpActiveRelationship(target);
  }

  console.log("\nPending seller-initiated invitations:");
  for (const target of DEMO_PENDING_SELLER_INVITES) {
    await setUpPendingSellerInvite(target);
  }

  console.log("\nPending buyer-initiated requests:");
  for (const target of DEMO_PENDING_BUYER_REQUESTS) {
    await setUpPendingBuyerRequest(target);
  }
}
