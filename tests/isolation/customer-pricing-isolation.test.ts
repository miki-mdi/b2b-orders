import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { getCustomer, listCustomers, updateCustomer } from "@/lib/domain/customers/customer-service";
import {
  getCustomerAddress,
  listCustomerAddresses,
  updateCustomerAddress,
} from "@/lib/domain/customers/customer-address-service";
import {
  createPriceList,
  getPriceList,
  listPriceLists,
  updatePriceList,
} from "@/lib/domain/pricing/price-list-service";
import { createPriceListItem } from "@/lib/domain/pricing/price-list-item-service";
import { setCustomerPriceListAssignment } from "@/lib/domain/customers/customer-price-list-assignment-service";
import { setCustomerProductVisibility } from "@/lib/domain/customers/customer-product-visibility-service";

/**
 * Proves Phase 1B's customer/pricing domain services respect the same
 * tenant isolation guarantees established in Phase 0/1A - both reading and
 * mutating another tenant's Customer/CustomerAddress/PriceList rows must be
 * impossible, and creating a row that *references* another tenant's row
 * (a PriceListItem's productUnitId, an assignment's priceListId, a
 * visibility override's customerId/productId) must be rejected too.
 */
describe("customer and pricing tenant isolation", () => {
  let alpha: SeededTenant;
  let beta: SeededTenant;
  let alphaActorUserId: string;
  let alphaProductUnitId: string;
  let betaAddressId: string;
  let betaPriceListId: string;
  let betaProductUnitId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    alpha = await seedTenant("Alpha", "alpha-pricing", passwordHash);
    beta = await seedTenant("Beta", "beta-pricing", passwordHash);
    alphaActorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: alpha.sellerAdminEmail } })).id;

    const alphaFixtures = await withTenantContext(alpha.tenantId, (tx) => tx.productUnit.findFirstOrThrow({}));
    alphaProductUnitId = alphaFixtures.id;

    const betaFixtures = await withTenantContext(beta.tenantId, async (tx) => ({
      address: await tx.customerAddress.findFirstOrThrow({}),
      productUnit: await tx.productUnit.findFirstOrThrow({}),
    }));
    betaAddressId = betaFixtures.address.id;
    betaProductUnitId = betaFixtures.productUnit.id;

    const betaPriceList = await withTenantContext(beta.tenantId, (tx) =>
      tx.priceList.create({ data: { tenantId: beta.tenantId, name: "Beta Standard", currency: "MKD" } })
    );
    betaPriceListId = betaPriceList.id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  describe("reads", () => {
    it("cannot fetch another tenant's customer, address, or price list", async () => {
      await expect(getCustomer(alpha.tenantId, beta.customers[0].id)).resolves.toBeNull();
      await expect(getCustomerAddress(alpha.tenantId, betaAddressId)).resolves.toBeNull();
      await expect(getPriceList(alpha.tenantId, betaPriceListId)).resolves.toBeNull();
    });

    it("list views exclude another tenant's rows", async () => {
      const customers = await listCustomers(alpha.tenantId);
      expect(customers.map((c) => c.id)).not.toContain(beta.customers[0].id);

      const priceLists = await listPriceLists(alpha.tenantId);
      expect(priceLists.map((p) => p.id)).not.toContain(betaPriceListId);
    });

    it("cannot list another customer's addresses via a foreign customerId", async () => {
      const addresses = await listCustomerAddresses(alpha.tenantId, beta.customers[0].id);
      expect(addresses).toHaveLength(0);
    });
  });

  describe("mutations", () => {
    it("cannot update another tenant's customer, address, or price list", async () => {
      await expect(
        updateCustomer(alpha.tenantId, alphaActorUserId, beta.customers[0].id, {
          name: "hacked",
          isActive: true,
        })
      ).rejects.toThrow();

      await expect(
        updateCustomerAddress(alpha.tenantId, alphaActorUserId, betaAddressId, {
          label: "hacked",
          recipientName: "hacked",
          addressLine1: "hacked",
          city: "hacked",
          country: "MK",
          isDefaultDelivery: false,
          isDefaultBilling: false,
          isActive: true,
        })
      ).rejects.toThrow();

      await expect(
        updatePriceList(alpha.tenantId, alphaActorUserId, betaPriceListId, {
          name: "hacked",
          currency: "MKD",
          isDefault: false,
          isActive: true,
        })
      ).rejects.toThrow();

      const stillBeta = await getPriceList(beta.tenantId, betaPriceListId);
      expect(stillBeta?.name).toBe("Beta Standard");
    });

    it("cannot create a price list item that references another tenant's product unit", async () => {
      const alphaPriceList = await createPriceList(alpha.tenantId, alphaActorUserId, {
        name: "Alpha Standard",
        currency: "MKD",
        isDefault: false,
        isActive: true,
      });

      await expect(
        createPriceListItem(alpha.tenantId, alphaActorUserId, alphaPriceList.id, {
          productUnitId: betaProductUnitId,
          price: 10,
        })
      ).rejects.toThrow(/Product unit not found/);
    });

    it("cannot create a price list item under another tenant's price list", async () => {
      await expect(
        createPriceListItem(alpha.tenantId, alphaActorUserId, betaPriceListId, {
          productUnitId: alphaProductUnitId,
          price: 10,
        })
      ).rejects.toThrow(/Price list not found/);
    });

    it("cannot assign another tenant's price list to a customer", async () => {
      await expect(
        setCustomerPriceListAssignment(alpha.tenantId, alphaActorUserId, alpha.customers[0].id, betaPriceListId)
      ).rejects.toThrow(/Price list not found/);
    });

    it("cannot assign a price list to another tenant's customer", async () => {
      await expect(
        setCustomerPriceListAssignment(alpha.tenantId, alphaActorUserId, beta.customers[0].id, alphaProductUnitId)
      ).rejects.toThrow(/Customer not found/);
    });

    it("cannot set product visibility for another tenant's customer", async () => {
      const alphaProduct = await withTenantContext(alpha.tenantId, (tx) => tx.product.findFirstOrThrow({}));
      await expect(
        setCustomerProductVisibility(alpha.tenantId, alphaActorUserId, beta.customers[0].id, alphaProduct.id, "HIDDEN")
      ).rejects.toThrow(/Customer not found/);
    });
  });

  describe("RLS alone (bypassing the application layer)", () => {
    it("blocks cross-tenant reads on Customer and PriceList with only the RLS session variable set", async () => {
      const rows = await prismaBase.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${alpha.tenantId}, true)`;
        return {
          customers: await tx.customer.findMany({}),
          priceLists: await tx.priceList.findMany({}),
        };
      });
      expect(rows.customers.map((c) => c.id)).not.toContain(beta.customers[0].id);
      expect(rows.priceLists.map((p) => p.id)).not.toContain(betaPriceListId);
    });

    it("blocks a cross-tenant write on PriceList with only the RLS session variable set", async () => {
      const result = await prismaBase.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${alpha.tenantId}, true)`;
        return tx.priceList.updateMany({ where: { id: betaPriceListId }, data: { name: "hacked via raw" } });
      });
      expect(result.count).toBe(0);
    });
  });
});
