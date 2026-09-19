import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import { getCategory, listCategories, updateCategory } from "@/lib/domain/catalog/category-service";
import { getUnitOfMeasure, listUnitsOfMeasure, updateUnitOfMeasure } from "@/lib/domain/catalog/unit-of-measure-service";
import { createProduct, getProduct, listProducts, updateProduct } from "@/lib/domain/catalog/product-service";
import {
  createProductUnit,
  getProductUnit,
  listProductUnits,
  updateProductUnit,
} from "@/lib/domain/catalog/product-unit-service";

/**
 * Proves Phase 1A's catalog domain services respect the same tenant
 * isolation guarantees the Phase 0 suite already established for the core
 * schema - both reading and mutating another tenant's Category, UnitOfMeasure,
 * Product and ProductUnit rows must be impossible, and creating a row that
 * *references* another tenant's row (a Product's categoryId, a ProductUnit's
 * unitOfMeasureId) must be rejected too, since a foreign key alone doesn't
 * enforce that (see the assertCategoryBelongsToTenant / assertUnitOfMeasureBelongsToTenant
 * comments in src/lib/domain/catalog/*.ts).
 */
describe("catalog tenant isolation", () => {
  let alpha: SeededTenant;
  let beta: SeededTenant;
  let alphaActorUserId: string;
  let alphaCategoryId: string;
  let alphaUnitId: string;
  let alphaProductId: string;
  let betaCategoryId: string;
  let betaUnitId: string;
  let betaProductId: string;
  let betaProductUnitId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    alpha = await seedTenant("Alpha", "alpha-catalog", passwordHash);
    beta = await seedTenant("Beta", "beta-catalog", passwordHash);
    alphaActorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: alpha.sellerAdminEmail } })).id;

    // seedTenant already creates one category/unit/product/productUnit per
    // tenant as part of its own fixture - fetch their ids directly. This
    // MUST go through withTenantContext, not the unscoped prismaBase: these
    // tables have RLS enabled, and prismaBase alone never sets
    // app.current_tenant_id for the transaction, so RLS would silently
    // return zero rows (fail-safe, per design) rather than an error.
    const alphaFixtures = await withTenantContext(alpha.tenantId, async (tx) => ({
      category: await tx.category.findFirstOrThrow({}),
      unit: await tx.unitOfMeasure.findFirstOrThrow({}),
      product: await tx.product.findFirstOrThrow({}),
    }));
    alphaCategoryId = alphaFixtures.category.id;
    alphaUnitId = alphaFixtures.unit.id;
    alphaProductId = alphaFixtures.product.id;

    const betaFixtures = await withTenantContext(beta.tenantId, async (tx) => ({
      category: await tx.category.findFirstOrThrow({}),
      unit: await tx.unitOfMeasure.findFirstOrThrow({}),
      product: await tx.product.findFirstOrThrow({}),
      productUnit: await tx.productUnit.findFirstOrThrow({}),
    }));
    betaCategoryId = betaFixtures.category.id;
    betaUnitId = betaFixtures.unit.id;
    betaProductId = betaFixtures.product.id;
    betaProductUnitId = betaFixtures.productUnit.id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  describe("reads", () => {
    it("cannot fetch another tenant's category, unit, product, or product unit", async () => {
      await expect(getCategory(alpha.tenantId, betaCategoryId)).resolves.toBeNull();
      await expect(getUnitOfMeasure(alpha.tenantId, betaUnitId)).resolves.toBeNull();
      await expect(getProduct(alpha.tenantId, betaProductId)).resolves.toBeNull();
      await expect(getProductUnit(alpha.tenantId, betaProductUnitId)).resolves.toBeNull();
    });

    it("list views exclude another tenant's rows", async () => {
      const categories = await listCategories(alpha.tenantId);
      expect(categories.map((c) => c.id)).not.toContain(betaCategoryId);

      const units = await listUnitsOfMeasure(alpha.tenantId);
      expect(units.map((u) => u.id)).not.toContain(betaUnitId);

      const products = await listProducts(alpha.tenantId);
      expect(products.map((p) => p.id)).not.toContain(betaProductId);

      const productUnits = await listProductUnits(alpha.tenantId, alphaProductId);
      expect(productUnits.map((pu) => pu.id)).not.toContain(betaProductUnitId);
    });
  });

  describe("mutations", () => {
    it("cannot update another tenant's category, unit, product, or product unit", async () => {
      const categoryInput = { nameMk: "х", nameEn: "hacked", sortOrder: 0, isActive: true } as const;
      await expect(updateCategory(alpha.tenantId, alphaActorUserId, betaCategoryId, categoryInput)).rejects.toThrow();

      const unitInput = { code: "hx", labelMk: "х", labelEn: "hacked", isActive: true } as const;
      await expect(updateUnitOfMeasure(alpha.tenantId, alphaActorUserId, betaUnitId, unitInput)).rejects.toThrow();

      const productInput = {
        nameMk: "х",
        nameEn: "hacked",
        sku: "HACKED-SKU",
        categoryId: alphaCategoryId,
        isActive: true,
      } as const;
      await expect(updateProduct(alpha.tenantId, alphaActorUserId, betaProductId, productInput)).rejects.toThrow();

      const productUnitInput = {
        unitOfMeasureId: alphaUnitId,
        sku: "HACKED-PU-SKU",
        label: "hacked",
        minOrderQty: 1,
        orderIncrement: 1,
        isDefault: false,
        isActive: true,
      } as const;
      await expect(updateProductUnit(alpha.tenantId, alphaActorUserId, betaProductUnitId, productUnitInput)).rejects.toThrow();

      // Confirm beta's rows are genuinely untouched.
      const stillBetaCategory = await getCategory(beta.tenantId, betaCategoryId);
      expect(stillBetaCategory?.nameEn).not.toBe("hacked");
    });

    it("cannot create a product that references another tenant's category", async () => {
      await expect(
        createProduct(alpha.tenantId, alphaActorUserId, {
          nameMk: "х",
          nameEn: "Cross-tenant product",
          sku: "CROSS-TENANT-1",
          categoryId: betaCategoryId,
          isActive: true,
        })
      ).rejects.toThrow(/Category not found/);
    });

    it("cannot create a product unit that references another tenant's unit of measure", async () => {
      await expect(
        createProductUnit(alpha.tenantId, alphaActorUserId, alphaProductId, {
          unitOfMeasureId: betaUnitId,
          sku: "CROSS-TENANT-PU-1",
          label: "Cross-tenant packaging",
          minOrderQty: 1,
          orderIncrement: 1,
          isDefault: false,
          isActive: true,
        })
      ).rejects.toThrow(/Unit of measure not found/);
    });

    it("cannot create a product unit under another tenant's product", async () => {
      await expect(
        createProductUnit(alpha.tenantId, alphaActorUserId, betaProductId, {
          unitOfMeasureId: alphaUnitId,
          sku: "CROSS-TENANT-PU-2",
          label: "Cross-tenant packaging",
          minOrderQty: 1,
          orderIncrement: 1,
          isDefault: false,
          isActive: true,
        })
      ).rejects.toThrow(/Product not found/);
    });
  });
});
