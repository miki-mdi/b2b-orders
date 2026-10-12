/**
 * Core decision logic for prisma/create-pilot-buyer.ts: attach exactly one
 * buyer User + CustomerMembership to an EXISTING Customer, never creating or
 * touching the Customer itself. Deliberately takes a narrow, structurally
 * mockable client interface (same style as preconditions.ts's
 * QueryableClient) rather than a concrete Prisma type, so this logic can be
 * unit-tested with plain mocks and no real database connection at all.
 *
 * Idempotency rule: CustomerMembership's own @@unique([userId, customerId])
 * (prisma/schema.prisma) is the real, DB-enforced backstop; the explicit
 * findUnique check below is what turns "already exists" into a clean,
 * friendly report instead of a raw constraint-violation error.
 */
export class PilotBuyerSetupError extends Error {}

export type PilotBuyerTxClient = {
  customer: {
    findFirst: (args: {
      where: { code: string };
    }) => Promise<{ id: string; isActive: boolean } | null>;
  };
  user: {
    findUnique: (args: { where: { email: string } }) => Promise<{ id: string; name: string } | null>;
    create: (args: {
      data: { email: string; name: string; passwordHash: string };
    }) => Promise<{ id: string; name: string }>;
  };
  customerMembership: {
    findUnique: (args: {
      where: { userId_customerId: { userId: string; customerId: string } };
    }) => Promise<{ id: string; isActive: boolean } | null>;
    create: (args: {
      data: { userId: string; customerId: string; tenantId: string; role: "BUYER_ADMIN" };
    }) => Promise<{ id: string }>;
  };
};

export type PilotBuyerInput = {
  tenantId: string;
  customerCode: string;
  email: string;
  name: string;
  passwordHash: string;
};

export type PilotBuyerOutcome =
  | { kind: "created"; userId: string; customerMembershipId: string; customerId: string }
  | { kind: "already-exists"; userId: string; customerMembershipId: string; customerId: string }
  | {
      kind: "reused-existing-user";
      userId: string;
      customerMembershipId: string;
      customerId: string;
      passwordIgnored: true;
    };

/**
 * Must be called from inside withTenantContext(tenantId, ...) - the Customer
 * and CustomerMembership lookups/writes below rely on the Layer 2/3 tenant
 * scoping that provides (see src/lib/db/with-tenant.ts), the same way every
 * other seller-side domain service does. `input.tenantId` is still passed
 * explicitly into the CustomerMembership create for clarity, matching
 * prisma/seed.ts's style, even though the scoped client also injects it.
 */
export async function createOrReusePilotBuyer(
  tx: PilotBuyerTxClient,
  input: PilotBuyerInput
): Promise<PilotBuyerOutcome> {
  const customer = await tx.customer.findFirst({ where: { code: input.customerCode } });
  if (!customer) {
    throw new PilotBuyerSetupError(
      `No customer found with code "${input.customerCode}". This script only attaches a buyer user to an ` +
        "existing customer - create the customer first (seller UI or CSV import), then re-run."
    );
  }
  if (!customer.isActive) {
    throw new PilotBuyerSetupError(
      `Customer "${input.customerCode}" exists but is deactivated. Refusing to create a buyer for an inactive customer.`
    );
  }

  const existingUser = await tx.user.findUnique({ where: { email: input.email } });

  if (!existingUser) {
    const user = await tx.user.create({
      data: { email: input.email, name: input.name, passwordHash: input.passwordHash },
    });
    const membership = await tx.customerMembership.create({
      data: { userId: user.id, customerId: customer.id, tenantId: input.tenantId, role: "BUYER_ADMIN" },
    });
    return { kind: "created", userId: user.id, customerMembershipId: membership.id, customerId: customer.id };
  }

  if (existingUser.name !== input.name) {
    throw new PilotBuyerSetupError(
      `A user with email "${input.email}" already exists with a different name ("${existingUser.name}" vs ` +
        `"${input.name}" entered just now). Refusing to guess whether this is the same person - re-run with ` +
        "the matching name, or resolve this manually."
    );
  }

  const existingMembership = await tx.customerMembership.findUnique({
    where: { userId_customerId: { userId: existingUser.id, customerId: customer.id } },
  });

  if (existingMembership) {
    if (!existingMembership.isActive) {
      throw new PilotBuyerSetupError(
        `A membership for "${input.email}" on customer "${input.customerCode}" already exists but is ` +
          "deactivated. Refusing to silently reactivate it - handle this deliberately (e.g. via the seller UI)."
      );
    }
    return {
      kind: "already-exists",
      userId: existingUser.id,
      customerMembershipId: existingMembership.id,
      customerId: customer.id,
    };
  }

  const membership = await tx.customerMembership.create({
    data: { userId: existingUser.id, customerId: customer.id, tenantId: input.tenantId, role: "BUYER_ADMIN" },
  });
  return {
    kind: "reused-existing-user",
    userId: existingUser.id,
    customerMembershipId: membership.id,
    customerId: customer.id,
    passwordIgnored: true,
  };
}
