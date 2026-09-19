/**
 * Seed data for local development and for the isolation test suite
 * (tests/isolation/). Creates TWO tenants, each with its own catalog and
 * customers, so cross-tenant leakage is something a test can actually try
 * and fail to do - not just assumed.
 *
 * Runs through the exact same withTenantContext/withCustomerContext helpers
 * the application uses (src/lib/db/with-tenant.ts), against DATABASE_URL -
 * i.e. as the low-privilege app role, not a superuser - so a misconfigured
 * grant or a broken RLS policy shows up here first, not in production.
 */
import "../scripts/load-env"; // must run before importing ../src/lib/db/prisma, which reads DATABASE_URL at import time
import { prismaBase } from "../src/lib/db/prisma";
import { withTenantContext, withCustomerContext } from "../src/lib/db/with-tenant";
import { hashPassword } from "../src/lib/auth/password";

export const DEV_PASSWORD = "DevPassword123!";

export async function resetDatabase() {
  // Order matters where there's no cascading delete configured; Tenant/User
  // cascades cover most of the tree, but these are cleared explicitly first
  // to be safe regardless of FK order.
  await prismaBase.auditLogEntry.deleteMany();
  await prismaBase.orderLine.deleteMany();
  await prismaBase.order.deleteMany();
  await prismaBase.favoriteListItem.deleteMany();
  await prismaBase.favoriteList.deleteMany();
  await prismaBase.customerProductVisibility.deleteMany();
  await prismaBase.customerPriceListAssignment.deleteMany();
  await prismaBase.customerAddress.deleteMany();
  await prismaBase.customerMembership.deleteMany();
  await prismaBase.customer.deleteMany();
  await prismaBase.priceListItem.deleteMany();
  await prismaBase.priceList.deleteMany();
  await prismaBase.productUnit.deleteMany();
  await prismaBase.product.deleteMany();
  await prismaBase.unitOfMeasure.deleteMany();
  await prismaBase.category.deleteMany();
  await prismaBase.deliveryRoute.deleteMany();
  await prismaBase.tenantMembership.deleteMany();
  await prismaBase.tenant.deleteMany();
  await prismaBase.user.deleteMany();
}

export type SeededCustomer = { id: string; buyerEmail: string; name: string };

export type SeededTenant = {
  tenantId: string;
  sellerAdminEmail: string;
  customers: SeededCustomer[];
  sampleOrderId: string;
};

/**
 * Creates one tenant with a full catalog (category/unit/product/productUnit/
 * priceList), two customers (each with an address, a buyer membership, and a
 * price list assignment), and one sample order for the first customer.
 * Exported so tests/isolation/ can build real cross-tenant, cross-customer
 * fixtures without duplicating this logic.
 */
export async function seedTenant(label: string, slug: string, passwordHash: string): Promise<SeededTenant> {
  const tenant = await prismaBase.tenant.create({
    data: { name: `${label} Distribution`, slug, defaultVatRate: 18 },
  });

  const sellerAdmin = await prismaBase.user.create({
    data: { email: `seller-admin@${slug}.test`, passwordHash, name: `${label} Seller Admin` },
  });

  const catalog = await withTenantContext(tenant.id, async (tx) => {
    await tx.tenantMembership.create({
      data: { userId: sellerAdmin.id, tenantId: tenant.id, role: "SELLER_ADMIN" },
    });

    const category = await tx.category.create({
      data: { tenantId: tenant.id, nameMk: "Општо", nameEn: "General" },
    });
    const unit = await tx.unitOfMeasure.create({
      data: { tenantId: tenant.id, code: "pc", labelMk: "Парче", labelEn: "Piece" },
    });
    const product = await tx.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: category.id,
        nameMk: `${label} Виџет`,
        nameEn: `${label} Widget`,
        sku: `${slug.toUpperCase()}-WIDGET`,
      },
    });
    const productUnit = await tx.productUnit.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        unitOfMeasureId: unit.id,
        sku: `${slug.toUpperCase()}-WIDGET-PC`,
        label: "Piece",
      },
    });
    const priceList = await tx.priceList.create({
      data: { tenantId: tenant.id, name: "Standard", isDefault: true },
    });
    await tx.priceListItem.create({
      data: { priceListId: priceList.id, productUnitId: productUnit.id, price: 100 },
    });

    const customers: SeededCustomer[] = [];
    for (const suffix of ["One", "Two"] as const) {
      const customer = await tx.customer.create({
        data: { tenantId: tenant.id, name: `${label} Customer ${suffix}` },
      });
      await tx.customerPriceListAssignment.create({
        data: { customerId: customer.id, priceListId: priceList.id },
      });
      await tx.customerAddress.create({
        data: {
          customerId: customer.id,
          tenantId: tenant.id,
          label: "Main warehouse",
          recipientName: `${label} Customer ${suffix}`,
          addressLine1: "1 Example Street",
          city: "Skopje",
          isDefaultDelivery: true,
        },
      });

      const buyerEmail = `buyer-${suffix.toLowerCase()}@${slug}.test`;
      const buyerUser = await prismaBase.user.create({
        data: { email: buyerEmail, passwordHash, name: `${label} Buyer ${suffix}` },
      });
      await tx.customerMembership.create({
        data: { userId: buyerUser.id, customerId: customer.id, tenantId: tenant.id, role: "BUYER_ADMIN" },
      });

      customers.push({ id: customer.id, buyerEmail, name: customer.name });
    }

    return { product, productUnit, customers };
  });

  const firstCustomer = catalog.customers[0];
  const buyerUser = await prismaBase.user.findUniqueOrThrow({ where: { email: firstCustomer.buyerEmail } });

  const order = await withCustomerContext(tenant.id, firstCustomer.id, (tx) =>
    tx.order.create({
      data: {
        tenantId: tenant.id,
        customerId: firstCustomer.id,
        orderNumber: 1,
        status: "SUBMITTED",
        placedByUserId: buyerUser.id,
        placedByName: buyerUser.name,
        placedByRole: "BUYER_ADMIN",
        submittedAt: new Date(),
        lines: {
          create: [
            {
              productUnitId: catalog.productUnit.id,
              productNameSnapshot: catalog.product.nameEn,
              productSkuSnapshot: catalog.productUnit.sku,
              unitLabelSnapshot: catalog.productUnit.label,
              requestedQty: 5,
              unitPriceAtOrderTime: 100,
              vatRateAtOrderTime: 18,
            },
          ],
        },
      },
    })
  );

  return {
    tenantId: tenant.id,
    sellerAdminEmail: sellerAdmin.email,
    customers: catalog.customers,
    sampleOrderId: order.id,
  };
}

async function main() {
  console.log("Resetting database...");
  await resetDatabase();

  const passwordHash = await hashPassword(DEV_PASSWORD);

  const platformAdmin = await prismaBase.user.create({
    data: {
      email: "platform-admin@b2b-orders.test",
      passwordHash,
      name: "Platform Admin",
      isPlatformAdmin: true,
    },
  });

  console.log("Seeding tenant Alpha...");
  const alpha = await seedTenant("Alpha", "alpha", passwordHash);

  console.log("Seeding tenant Beta...");
  const beta = await seedTenant("Beta", "beta", passwordHash);

  console.log("\nSeed complete. All accounts share the password:", DEV_PASSWORD, "\n");
  console.table([
    { role: "Platform Admin", email: platformAdmin.email },
    { role: "Alpha Seller Admin", email: alpha.sellerAdminEmail },
    ...alpha.customers.map((c) => ({ role: `Alpha Buyer (${c.name})`, email: c.buyerEmail })),
    { role: "Beta Seller Admin", email: beta.sellerAdminEmail },
    ...beta.customers.map((c) => ({ role: `Beta Buyer (${c.name})`, email: c.buyerEmail })),
  ]);
  console.log({
    tenantAlphaId: alpha.tenantId,
    tenantBetaId: beta.tenantId,
    alphaCustomerIds: alpha.customers.map((c) => c.id),
    betaCustomerIds: beta.customers.map((c) => c.id),
    alphaSampleOrderId: alpha.sampleOrderId,
    betaSampleOrderId: beta.sampleOrderId,
  });
}

// Guard against running main() when this module is imported for its
// exports (e.g. by tests/isolation/) rather than executed directly via
// `npx tsx prisma/seed.ts` / `npm run db:seed`.
const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed.ts");
if (isDirectRun) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prismaBase.$disconnect();
    });
}
