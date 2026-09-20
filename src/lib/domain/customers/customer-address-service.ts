import type { CustomerAddressInput } from "@/lib/validation/customers";
import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";

export class CustomerNotFoundError extends Error {}

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

export async function createCustomerAddress(
  tenantId: string,
  actorUserId: string,
  customerId: string,
  input: CustomerAddressInput
) {
  return withTenantContext(tenantId, async (tx) => {
    await assertCustomerBelongsToTenant(tx, customerId);

    const address = await tx.customerAddress.create({
      data: { tenantId, customerId, ...toData(input) },
    });

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
    });
    return address;
  });
}

export async function updateCustomerAddress(
  tenantId: string,
  actorUserId: string,
  id: string,
  input: CustomerAddressInput
) {
  return withTenantContext(tenantId, async (tx) => {
    const before = await tx.customerAddress.findUniqueOrThrow({ where: { id } });
    const after = await tx.customerAddress.update({ where: { id }, data: toData(input) });

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
    });
    return after;
  });
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
