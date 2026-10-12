// Pure unit tests against a fully mocked tx client - no DATABASE_URL, no
// local dev database, no Railway, no network at all. createOrReusePilotBuyer
// only ever calls the four methods on PilotBuyerTxClient, so a plain vi.fn()
// fake satisfies the whole interface.
import { describe, expect, it, vi } from "vitest";
import {
  createOrReusePilotBuyer,
  PilotBuyerSetupError,
  type PilotBuyerTxClient,
} from "@/lib/bootstrap/pilot-buyer-service";

const TENANT_ID = "tenant-1";
const CUSTOMER_CODE = "PILOT-BUYER-001";
const CUSTOMER_ID = "customer-1";

function makeTx(overrides?: {
  customer?: Partial<PilotBuyerTxClient["customer"]>;
  user?: Partial<PilotBuyerTxClient["user"]>;
  customerMembership?: Partial<PilotBuyerTxClient["customerMembership"]>;
}): PilotBuyerTxClient {
  return {
    customer: {
      findFirst: vi.fn().mockResolvedValue({ id: CUSTOMER_ID, isActive: true }),
      ...overrides?.customer,
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "user-new", name: "New Buyer" }),
      ...overrides?.user,
    },
    customerMembership: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "membership-new" }),
      ...overrides?.customerMembership,
    },
  };
}

const baseInput = {
  tenantId: TENANT_ID,
  customerCode: CUSTOMER_CODE,
  email: "buyer@example.test",
  name: "New Buyer",
  passwordHash: "bcrypt-hash-not-a-real-password",
};

describe("createOrReusePilotBuyer", () => {
  it("creates a new User and CustomerMembership when neither exists", async () => {
    const tx = makeTx();

    const outcome = await createOrReusePilotBuyer(tx, baseInput);

    expect(outcome).toEqual({
      kind: "created",
      userId: "user-new",
      customerMembershipId: "membership-new",
      customerId: CUSTOMER_ID,
    });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: { email: baseInput.email, name: baseInput.name, passwordHash: baseInput.passwordHash },
    });
    expect(tx.customerMembership.create).toHaveBeenCalledWith({
      data: { userId: "user-new", customerId: CUSTOMER_ID, tenantId: TENANT_ID, role: "BUYER_ADMIN" },
    });
  });

  it("refuses when no customer with the given code exists", async () => {
    const tx = makeTx({ customer: { findFirst: vi.fn().mockResolvedValue(null) } });

    await expect(createOrReusePilotBuyer(tx, baseInput)).rejects.toThrow(PilotBuyerSetupError);
    await expect(createOrReusePilotBuyer(tx, baseInput)).rejects.toThrow(/No customer found/);
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("refuses when the customer exists but is deactivated", async () => {
    const tx = makeTx({ customer: { findFirst: vi.fn().mockResolvedValue({ id: CUSTOMER_ID, isActive: false }) } });

    await expect(createOrReusePilotBuyer(tx, baseInput)).rejects.toThrow(/deactivated/);
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("is idempotent: reports already-exists and creates nothing when an active membership is already there", async () => {
    const tx = makeTx({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-existing", name: baseInput.name }) },
      customerMembership: {
        findUnique: vi.fn().mockResolvedValue({ id: "membership-existing", isActive: true }),
      },
    });

    const outcome = await createOrReusePilotBuyer(tx, baseInput);

    expect(outcome).toEqual({
      kind: "already-exists",
      userId: "user-existing",
      customerMembershipId: "membership-existing",
      customerId: CUSTOMER_ID,
    });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.customerMembership.create).not.toHaveBeenCalled();
  });

  it("refuses when the existing user has a different name - does not guess intent", async () => {
    const tx = makeTx({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-existing", name: "A Completely Different Name" }) },
    });

    await expect(createOrReusePilotBuyer(tx, baseInput)).rejects.toThrow(PilotBuyerSetupError);
    await expect(createOrReusePilotBuyer(tx, baseInput)).rejects.toThrow(/different name/);
    expect(tx.customerMembership.findUnique).not.toHaveBeenCalled();
    expect(tx.customerMembership.create).not.toHaveBeenCalled();
  });

  it("refuses when a membership for this user/customer already exists but is deactivated - never silently reactivates", async () => {
    const tx = makeTx({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-existing", name: baseInput.name }) },
      customerMembership: {
        findUnique: vi.fn().mockResolvedValue({ id: "membership-existing", isActive: false }),
      },
    });

    await expect(createOrReusePilotBuyer(tx, baseInput)).rejects.toThrow(PilotBuyerSetupError);
    await expect(createOrReusePilotBuyer(tx, baseInput)).rejects.toThrow(/deactivated/);
    expect(tx.customerMembership.create).not.toHaveBeenCalled();
  });

  it("safely reuses an existing, name-matching user with no prior membership - ignores the new password", async () => {
    const tx = makeTx({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-existing", name: baseInput.name }) },
      customerMembership: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "membership-new-for-existing-user" }),
      },
    });

    const outcome = await createOrReusePilotBuyer(tx, baseInput);

    expect(outcome).toEqual({
      kind: "reused-existing-user",
      userId: "user-existing",
      customerMembershipId: "membership-new-for-existing-user",
      customerId: CUSTOMER_ID,
      passwordIgnored: true,
    });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.customerMembership.create).toHaveBeenCalledWith({
      data: { userId: "user-existing", customerId: CUSTOMER_ID, tenantId: TENANT_ID, role: "BUYER_ADMIN" },
    });
  });
});
