import type { CustomerAddressInput } from "@/lib/validation/customers";
import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import { withCustomerContext, withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";
import { DuplicateValueError, isUniqueConstraintError } from "@/lib/domain/shared/errors";

export class CustomerNotFoundError extends Error {}

/**
 * Buyer-side: this customer's own active delivery addresses, default-first.
 * Goes through withCustomerContext (not the seller-oriented
 * listCustomerAddresses below) so a buyer session can never be pointed at
 * another customer's addresses even by accident - customerId here is always
 * the session's own, never a route param.
 */
export function listActiveCustomerAddresses(tenantId: string, customerId: string) {
  return withCustomerContext(tenantId, customerId, (tx) =>
    tx.customerAddress.findMany({
      where: { isActive: true },
      orderBy: [{ isDefaultDelivery: "desc" }, { createdAt: "asc" }],
    })
  );
}

async function assertCustomerBelongsToTenant(tx: ScopedTransactionClient, customerId: string) {
  const customer = await tx.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new CustomerNotFoundError("Customer not found.");
  }
}

export function listCustomerAddresses(tenantId: string, customerId: string) {
  return withTenantContext(tenantId, (tx) =>
    tx.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefaultDelivery: "desc" }, { createdAt: "asc" }],
    })
  );
}

export function getCustomerAddress(tenantId: string, id: string) {
  return withTenantContext(tenantId, (tx) => tx.customerAddress.findUnique({ where: { id } }));
}

function toData(input: CustomerAddressInput) {
  return {
    label: input.label,
    recipientName: input.recipientName,
    phone: input.phone ?? null,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2 ?? null,
    city: input.city,
    postalCode: input.postalCode ?? null,
    country: input.country,
    isDefaultDelivery: input.isDefaultDelivery,
    isDefaultBilling: input.isDefaultBilling,
    isActive: input.isActive,
  };
}

// Only one address per customer may be the default delivery address (same
// idea for billing) - the schema doesn't enforce this with a constraint
// (a partial unique index expressing "isDefaultDelivery = true" isn't
// something Prisma's schema language can express), so it's enforced here:
// setting one address as default un-sets it on every other address for the
// same customer, inside the same transaction as the write that set it.
async function clearOtherDefaults(
  tx: ScopedTransactionClient,
  customerId: string,
  excludeId: string,
  field: "isDefaultDelivery" | "isDefaultBilling"
) {
  await tx.customerAddress.updateMany({
    where: { customerId, id: { not: excludeId }, [field]: true },
    data: { [field]: false },
  });
}

/** Tx-scoped core, reused by CSV import (Phase 1F-A) - see category-service.ts's createCategoryInTx comment. */
export async function createCustomerAddressInTx(
  tx: ScopedTransactionClient,
  tenantId: string,
  actorUserId: string,
  customerId: string,
  input: CustomerAddressInput,
  reason?: string
) {
  await assertCustomerBelongsToTenant(tx, customerId);

  let address;
  try {
    address = await tx.customerAddress.create({
      data: { tenantId, customerId, ...toData(input) },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateValueError("label", "This customer already has an address with this label.");
    }
    throw error;
  }

  if (input.isDefaultDelivery) {
    await clearOtherDefaults(tx, customerId, address.id, "isDefaultDelivery");
  }
  if (input.isDefaultBilling) {
    await clearOtherDefaults(tx, customerId, address.id, "isDefaultBilling");
  }

  await writeAuditLogEntry(tx, {
    tenantId,
    actorUserId,
    actingContext: "TENANT",
    entityType: "CustomerAddress",
    entityId: address.id,
    action: "CREATE",
    newValue: address,
    reason,
  });
  return address;
}

export async function createCustomerAddress(
  tenantId: string,
  actorUserId: string,
  customerId: string,
  input: CustomerAddressInput
) {
  return withTenantContext(tenantId, (tx) => createCustomerAddressInTx(tx, tenantId, actorUserId, customerId, input));
}

/** Tx-scoped core, reused by CSV import (Phase 1F-A). */
export async function updateCustomerAddressInTx(
  tx: ScopedTransactionClient,
  tenantId: string,
  actorUserId: string,
  id: string,
  input: CustomerAddressInput,
  reason?: string
) {
  const before = await tx.customerAddress.findUniqueOrThrow({ where: { id } });
  let after;
  try {
    after = await tx.customerAddress.update({ where: { id }, data: toData(input) });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateValueError("label", "This customer already has an address with this label.");
    }
    throw error;
  }

  if (input.isDefaultDelivery) {
    await clearOtherDefaults(tx, before.customerId, id, "isDefaultDelivery");
  }
  if (input.isDefaultBilling) {
    await clearOtherDefaults(tx, before.customerId, id, "isDefaultBilling");
  }

  await writeAuditLogEntry(tx, {
    tenantId,
    actorUserId,
    actingContext: "TENANT",
    entityType: "CustomerAddress",
    entityId: id,
    action: "UPDATE",
    oldValue: before,
    newValue: after,
    reason,
  });
  return after;
}

export async function updateCustomerAddress(
  tenantId: string,
  actorUserId: string,
  id: string,
  input: CustomerAddressInput
) {
  return withTenantContext(tenantId, (tx) => updateCustomerAddressInTx(tx, tenantId, actorUserId, id, input));
}

export async function setCustomerAddressActive(
  tenantId: string,
  actorUserId: string,
  id: string,
  isActive: boolean
) {
  return withTenantContext(tenantId, async (tx) => {
    const before = await tx.customerAddress.findUniqueOrThrow({ where: { id } });
    const after = await tx.customerAddress.update({ where: { id }, data: { isActive } });
    await writeAuditLogEntry(tx, {
      tenantId,
      actorUserId,
      actingContext: "TENANT",
      entityType: "CustomerAddress",
      entityId: id,
      action: isActive ? "REACTIVATE" : "DEACTIVATE",
      oldValue: before,
      newValue: after,
    });
    return after;
  });
}
