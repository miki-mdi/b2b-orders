import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { listBuyerCatalog, listBuyerCategories } from "@/lib/domain/catalog/buyer-catalog-service";
import { createCategory } from "@/lib/domain/catalog/category-service";
import { createProduct, setProductActive } from "@/lib/domain/catalog/product-service";
import { createProductUnit, setProductUnitActive } from "@/lib/domain/catalog/product-unit-service";
import { createPriceListItem } from "@/lib/domain/pricing/price-list-item-service";
import { setCustomerProductVisibility } from "@/lib/domain/customers/customer-product-visibility-service";

describe("buyer catalog visibility", () => {
  let tenant: SeededTenant;
  let actorUserId: string;
  let customerId: string;
  let priceListId: string;
  let unitOfMeasureId: string;
  let categoryId: string;
  let seededProductUnitId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Theta", "theta-buyer", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
    customerId = tenant.customers[0].id;

    const fixtures = await withTenantContext(tenant.tenantId, (tx) =>
      tx.productUnit.findFirstOrThrow({ include: { product: true } })
    );
    seededProductUnitId = fixtures.id;
    categoryId = fixtures.product.categoryId!;
    unitOfMeasureId = fixtures.unitOfMeasureId;

    const priceList = await withTenantContext(tenant.tenantId, (tx) => tx.priceList.findFirstOrThrow({}));
    priceListId = priceList.id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it("includes the seeded, priced, active product unit", async () => {
    const items = await listBuyerCatalog(tenant.tenantId, customerId, {});
    expect(items.map((i) => i.productUnitId)).toContain(seededProductUnitId);
  });

  it("excludes a product unit with no price list item for this customer (NO_PRICE)", async () => {
    const category = await createCategory(tenant.tenantId, actorUserId, {
      nameMk: "Без цена",
      nameEn: "No price",
      sortOrder: 0,
      isActive: true,
    });
    const product = await createProduct(tenant.tenantId, actorUserId, {
      nameMk: "Скап",
      nameEn: "Unpriced",
      sku: "UNPRICED-1",
      categoryId: category.id,
      isActive: true,
    });
    const productUnit = await createProductUnit(tenant.tenantId, actorUserId, product.id, {
      unitOfMeasureId,
      sku: "UNPRICED-1-EA",
      label: "Each",
      minOrderQty: 1,
      orderIncrement: 1,
      isDefault: true,
      isActive: true,
    });

    const items = await listBuyerCatalog(tenant.tenantId, customerId, {});
    expect(items.map((i) => i.productUnitId)).not.toContain(productUnit.id);
  });

  it("excludes a product explicitly hidden for this customer", async () => {
    const product = await createProduct(tenant.tenantId, actorUserId, {
      nameMk: "Скриен",
      nameEn: "Hidden Product",
      sku: "HIDDEN-1",
      categoryId,
      isActive: true,
    });
    const productUnit = await createProductUnit(tenant.tenantId, actorUserId, product.id, {
      unitOfMeasureId,
      sku: "HIDDEN-1-EA",
      label: "Each",
      minOrderQty: 1,
      orderIncrement: 1,
      isDefault: true,
      isActive: true,
    });
    await createPriceListItem(tenant.tenantId, actorUserId, priceListId, { productUnitId: productUnit.id, price: 10 });

    let items = await listBuyerCatalog(tenant.tenantId, customerId, {});
    expect(items.map((i) => i.productUnitId)).toContain(productUnit.id);

    await setCustomerProductVisibility(tenant.tenantId, actorUserId, customerId, product.id, "HIDDEN");
    items = await listBuyerCatalog(tenant.tenantId, customerId, {});
    expect(items.map((i) => i.productUnitId)).not.toContain(productUnit.id);

    // Hiding is per-customer, not global - the other seeded customer must still see it.
    const otherCustomerId = tenant.customers[1].id;
    const otherItems = await listBuyerCatalog(tenant.tenantId, otherCustomerId, {});
    expect(otherItems.map((i) => i.productUnitId)).toContain(productUnit.id);
  });

  it("excludes an inactive product even if priced", async () => {
    const product = await createProduct(tenant.tenantId, actorUserId, {
      nameMk: "Неактивен",
      nameEn: "Inactive Product",
      sku: "INACTIVE-PROD-1",
      categoryId,
      isActive: true,
    });
    const productUnit = await createProductUnit(tenant.tenantId, actorUserId, product.id, {
      unitOfMeasureId,
      sku: "INACTIVE-PROD-1-EA",
      label: "Each",
      minOrderQty: 1,
      orderIncrement: 1,
      isDefault: true,
      isActive: true,
    });
    await createPriceListItem(tenant.tenantId, actorUserId, priceListId, { productUnitId: productUnit.id, price: 10 });
    await setProductActive(tenant.tenantId, actorUserId, product.id, false);

    const items = await listBuyerCatalog(tenant.tenantId, customerId, {});
    expect(items.map((i) => i.productUnitId)).not.toContain(productUnit.id);
  });

  it("excludes an inactive product unit even if the product itself is active and priced", async () => {
    const product = await createProduct(tenant.tenantId, actorUserId, {
      nameMk: "Активен производ",
      nameEn: "Active Product",
      sku: "ACTIVE-PROD-INACTIVE-UNIT",
      categoryId,
      isActive: true,
    });
    const productUnit = await createProductUnit(tenant.tenantId, actorUserId, product.id, {
      unitOfMeasureId,
      sku: "ACTIVE-PROD-INACTIVE-UNIT-EA",
      label: "Each",
      minOrderQty: 1,
      orderIncrement: 1,
      isDefault: true,
      isActive: true,
    });
    await createPriceListItem(tenant.tenantId, actorUserId, priceListId, { productUnitId: productUnit.id, price: 10 });
    await setProductUnitActive(tenant.tenantId, actorUserId, productUnit.id, false);

    const items = await listBuyerCatalog(tenant.tenantId, customerId, {});
    expect(items.map((i) => i.productUnitId)).not.toContain(productUnit.id);
  });

  it("filters by category", async () => {
    const otherCategory = await createCategory(tenant.tenantId, actorUserId, {
      nameMk: "Друга категорија",
      nameEn: "Other Category",
      sortOrder: 1,
      isActive: true,
    });
    const product = await createProduct(tenant.tenantId, actorUserId, {
      nameMk: "Во друга категорија",
      nameEn: "In Other Category",
      sku: "OTHER-CAT-1",
      categoryId: otherCategory.id,
      isActive: true,
    });
    const productUnit = await createProductUnit(tenant.tenantId, actorUserId, product.id, {
      unitOfMeasureId,
      sku: "OTHER-CAT-1-EA",
      label: "Each",
      minOrderQty: 1,
      orderIncrement: 1,
      isDefault: true,
      isActive: true,
    });
    await createPriceListItem(tenant.tenantId, actorUserId, priceListId, { productUnitId: productUnit.id, price: 10 });

    const filtered = await listBuyerCatalog(tenant.tenantId, customerId, { categoryId: otherCategory.id });
    expect(filtered.map((i) => i.productUnitId)).toEqual([productUnit.id]);

    const categories = await listBuyerCategories(tenant.tenantId, customerId);
    expect(categories.map((c) => c.id)).toContain(otherCategory.id);
  });

  it("searches by product SKU, name, and unit SKU", async () => {
    const product = await createProduct(tenant.tenantId, actorUserId, {
      nameMk: "Пребарлив производ",
      nameEn: "Searchable Widget",
      sku: "SEARCHABLE-SKU-1",
      categoryId,
      isActive: true,
    });
    const productUnit = await createProductUnit(tenant.tenantId, actorUserId, product.id, {
      unitOfMeasureId,
      sku: "SEARCHABLE-UNIT-SKU-1",
      label: "Each",
      minOrderQty: 1,
      orderIncrement: 1,
      isDefault: true,
      isActive: true,
    });
    await createPriceListItem(tenant.tenantId, actorUserId, priceListId, { productUnitId: productUnit.id, price: 10 });

    const byName = await listBuyerCatalog(tenant.tenantId, customerId, { search: "Searchable Widget" });
    expect(byName.map((i) => i.productUnitId)).toContain(productUnit.id);

    const byProductSku = await listBuyerCatalog(tenant.tenantId, customerId, { search: "SEARCHABLE-SKU-1" });
    expect(byProductSku.map((i) => i.productUnitId)).toContain(productUnit.id);

    const byUnitSku = await listBuyerCatalog(tenant.tenantId, customerId, { search: "SEARCHABLE-UNIT-SKU-1" });
    expect(byUnitSku.map((i) => i.productUnitId)).toContain(productUnit.id);

    const noMatch = await listBuyerCatalog(tenant.tenantId, customerId, { search: "no-such-thing-xyz" });
    expect(noMatch.map((i) => i.productUnitId)).not.toContain(productUnit.id);
  });

  it("shows the customer's effective (discounted) price, not the raw list price", async () => {
    const { setCustomerDiscount } = await import("@/lib/domain/customers/customer-discount-service");
    await setCustomerDiscount(tenant.tenantId, actorUserId, customerId, 10);

    const items = await listBuyerCatalog(tenant.tenantId, customerId, {});
    const seeded = items.find((i) => i.productUnitId === seededProductUnitId);
    expect(seeded?.price).toBe(90); // seeded price list item is 100, 10% discount -> 90

    await setCustomerDiscount(tenant.tenantId, actorUserId, customerId, null);
  });
});
