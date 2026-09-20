import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import {
  createCustomer,
  getCustomer,
  setCustomerActive,
  updateCustomer,
} from "@/lib/domain/customers/customer-service";
import {
  createCustomerAddress,
  listCustomerAddresses,
  updateCustomerAddress,
} from "@/lib/domain/customers/customer-address-service";
import { createPriceList, getPriceList, setPriceListActive, updatePriceList } from "@/lib/domain/pricing/price-list-service";
import { createPriceListItem, deletePriceListItem, updatePriceListItem } from "@/lib/domain/pricing/price-list-item-service";
import { getCustomerPriceListAssignment, setCustomerPriceListAssignment } from "@/lib/domain/customers/customer-price-list-assignment-service";
import { setCustomerDiscount } from "@/lib/domain/customers/customer-discount-service";
import { DuplicateValueError } from "@/lib/domain/shared/errors";

describe("customer and pricing CRUD", () => {
  let tenant: SeededTenant;
  let actorUserId: string;
  let productUnitId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Delta", "delta-crud", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
    const productUnit = await withTenantContext(tenant.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));
    productUnitId = productUnit.id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  describe("customer happy path", () => {
    it("creates, updates, deactivates and reactivates a customer, auditing every step", async () => {
      const created = await createCustomer(tenant.tenantId, actorUserId, {
        name: "Acme Trading",
        code: "ACME-1",
        isActive: true,
      });
      expect(created.name).toBe("Acme Trading");

      const updated = await updateCustomer(tenant.tenantId, actorUserId, created.id, {
        name: "Acme Trading DOOEL",
        code: "ACME-1",
        contactEmail: "buyer@acme.test",
        isActive: true,
      });
      expect(updated.name).toBe("Acme Trading DOOEL");
      expect(updated.contactEmail).toBe("buyer@acme.test");

      const deactivated = await setCustomerActive(tenant.tenantId, actorUserId, created.id, false);
      expect(deactivated.isActive).toBe(false);
      const reactivated = await setCustomerActive(tenant.tenantId, actorUserId, created.id, true);
      expect(reactivated.isActive).toBe(true);

      const auditEntries = await withTenantContext(tenant.tenantId, (tx) =>
        tx.auditLogEntry.findMany({ where: { entityType: "Customer", entityId: created.id }, orderBy: { createdAt: "asc" } })
      );
      expect(auditEntries.map((e) => e.action)).toEqual(["CREATE", "UPDATE", "DEACTIVATE", "REACTIVATE"]);
    });

    it("rejects a duplicate customer code within the same tenant", async () => {
      await createCustomer(tenant.tenantId, actorUserId, { name: "Dup A", code: "DUPC-1", isActive: true });
      await expect(
        createCustomer(tenant.tenantId, actorUserId, { name: "Dup B", code: "DUPC-1", isActive: true })
      ).rejects.toBeInstanceOf(DuplicateValueError);
    });
  });

  describe("customer address happy path", () => {
    it("creates, updates and deactivates an address, auditing every step", async () => {
      const customer = await createCustomer(tenant.tenantId, actorUserId, { name: "Addr Customer", isActive: true });

      const address = await createCustomerAddress(tenant.tenantId, actorUserId, customer.id, {
        label: "Main",
        recipientName: "Jane Doe",
        addressLine1: "1 Main St",
        city: "Skopje",
        country: "MK",
        isDefaultDelivery: true,
        isDefaultBilling: false,
        isActive: true,
      });
      expect(address.isDefaultDelivery).toBe(true);

      const updated = await updateCustomerAddress(tenant.tenantId, actorUserId, address.id, {
        label: "Main Warehouse",
        recipientName: "Jane Doe",
        addressLine1: "1 Main St",
        city: "Skopje",
        country: "MK",
        isDefaultDelivery: true,
        isDefaultBilling: false,
        isActive: true,
      });
      expect(updated.label).toBe("Main Warehouse");

      const auditEntries = await withTenantContext(tenant.tenantId, (tx) =>
        tx.auditLogEntry.findMany({ where: { entityType: "CustomerAddress", entityId: address.id }, orderBy: { createdAt: "asc" } })
      );
      expect(auditEntries.map((e) => e.action)).toEqual(["CREATE", "UPDATE"]);
    });

    it("only one address per customer can be the default delivery address", async () => {
      const customer = await createCustomer(tenant.tenantId, actorUserId, { name: "Default Test", isActive: true });

      const addressOne = await createCustomerAddress(tenant.tenantId, actorUserId, customer.id, {
        label: "One",
        recipientName: "A",
        addressLine1: "1 St",
        city: "Skopje",
        country: "MK",
        isDefaultDelivery: true,
        isDefaultBilling: false,
        isActive: true,
      });
      const addressTwo = await createCustomerAddress(tenant.tenantId, actorUserId, customer.id, {
        label: "Two",
        recipientName: "B",
        addressLine1: "2 St",
        city: "Skopje",
        country: "MK",
        isDefaultDelivery: true,
        isDefaultBilling: false,
        isActive: true,
      });

      const addresses = await listCustomerAddresses(tenant.tenantId, customer.id);
      const defaults = addresses.filter((a) => a.isDefaultDelivery);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(addressTwo.id);

      const addressOneNow = addresses.find((a) => a.id === addressOne.id);
      expect(addressOneNow?.isDefaultDelivery).toBe(false);
    });
  });

  describe("price list happy path", () => {
    it("creates, updates, deactivates a price list and prevents duplicate price list items", async () => {
      const priceList = await createPriceList(tenant.tenantId, actorUserId, {
        name: "Standard",
        code: "STD",
        currency: "MKD",
        isDefault: true,
        isActive: true,
      });

      const updated = await updatePriceList(tenant.tenantId, actorUserId, priceList.id, {
        name: "Standard Pricing",
        code: "STD",
        currency: "MKD",
        isDefault: true,
        isActive: true,
      });
      expect(updated.name).toBe("Standard Pricing");

      const deactivated = await setPriceListActive(tenant.tenantId, actorUserId, priceList.id, false);
      expect(deactivated.isActive).toBe(false);

      await createPriceListItem(tenant.tenantId, actorUserId, priceList.id, { productUnitId, price: 100 });
      await expect(
        createPriceListItem(tenant.tenantId, actorUserId, priceList.id, { productUnitId, price: 150 })
      ).rejects.toBeInstanceOf(DuplicateValueError);

      const withItems = await getPriceList(tenant.tenantId, priceList.id);
      expect(withItems?.items).toHaveLength(1);
      expect(withItems?.items[0].price.toString()).toBe("100");
    });

    it("can update and delete a price list item", async () => {
      const priceList = await createPriceList(tenant.tenantId, actorUserId, {
        name: "Delete Test",
        currency: "MKD",
        isDefault: false,
        isActive: true,
      });
      const item = await createPriceListItem(tenant.tenantId, actorUserId, priceList.id, { productUnitId, price: 50 });

      const updated = await updatePriceListItem(tenant.tenantId, actorUserId, item.id, { price: 60 });
      expect(updated.price.toString()).toBe("60");

      await deletePriceListItem(tenant.tenantId, actorUserId, item.id);
      const afterDelete = await getPriceList(tenant.tenantId, priceList.id);
      expect(afterDelete?.items.find((i) => i.id === item.id)).toBeUndefined();
    });

    it("rejects a duplicate price list code within the same tenant", async () => {
      await createPriceList(tenant.tenantId, actorUserId, { name: "A", code: "DUPPL", currency: "MKD", isDefault: false, isActive: true });
      await expect(
        createPriceList(tenant.tenantId, actorUserId, { name: "B", code: "DUPPL", currency: "MKD", isDefault: false, isActive: true })
      ).rejects.toBeInstanceOf(DuplicateValueError);
    });
  });

  describe("customer price-list assignment", () => {
    it("assigns, changes, and clears a customer's price list assignment, auditing every step", async () => {
      const customer = await createCustomer(tenant.tenantId, actorUserId, { name: "Assignment Test", isActive: true });
      const priceListA = await createPriceList(tenant.tenantId, actorUserId, { name: "List A", currency: "MKD", isDefault: false, isActive: true });
      const priceListB = await createPriceList(tenant.tenantId, actorUserId, { name: "List B", currency: "MKD", isDefault: false, isActive: true });

      const assigned = await setCustomerPriceListAssignment(tenant.tenantId, actorUserId, customer.id, priceListA.id);
      expect(assigned?.priceListId).toBe(priceListA.id);

      const changed = await setCustomerPriceListAssignment(tenant.tenantId, actorUserId, customer.id, priceListB.id);
      expect(changed?.priceListId).toBe(priceListB.id);

      const current = await getCustomerPriceListAssignment(tenant.tenantId, customer.id);
      expect(current?.priceListId).toBe(priceListB.id);

      const cleared = await setCustomerPriceListAssignment(tenant.tenantId, actorUserId, customer.id, null);
      expect(cleared).toBeNull();
      const afterClear = await getCustomerPriceListAssignment(tenant.tenantId, customer.id);
      expect(afterClear).toBeNull();

      const auditEntries = await withTenantContext(tenant.tenantId, (tx) =>
        tx.auditLogEntry.findMany({ where: { entityType: "CustomerPriceListAssignment" }, orderBy: { createdAt: "asc" } })
      );
      expect(auditEntries.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("customer discount", () => {
    it("sets and clears a customer discount, auditing the change", async () => {
      const customer = await createCustomer(tenant.tenantId, actorUserId, { name: "Discount Test", isActive: true });

      const withDiscount = await setCustomerDiscount(tenant.tenantId, actorUserId, customer.id, 15);
      expect(withDiscount.discountPercent?.toString()).toBe("15");

      const cleared = await setCustomerDiscount(tenant.tenantId, actorUserId, customer.id, null);
      expect(cleared.discountPercent).toBeNull();

      const auditEntries = await withTenantContext(tenant.tenantId, (tx) =>
        tx.auditLogEntry.findMany({ where: { entityType: "Customer", entityId: customer.id, reason: "Discount changed" } })
      );
      expect(auditEntries).toHaveLength(2);
    });
  });

  describe("inactive record behavior", () => {
    it("an inactive customer still appears in the seller's list and is still readable", async () => {
      const customer = await createCustomer(tenant.tenantId, actorUserId, { name: "Will Deactivate", isActive: true });
      await setCustomerActive(tenant.tenantId, actorUserId, customer.id, false);

      const fetched = await getCustomer(tenant.tenantId, customer.id);
      expect(fetched?.isActive).toBe(false);
    });
  });
});
