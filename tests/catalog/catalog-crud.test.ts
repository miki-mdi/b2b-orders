import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db/prisma";
import { withTenantContext } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { DEV_PASSWORD, resetDatabase, seedTenant, type SeededTenant } from "../../prisma/seed";
import {
  createCategory,
  getCategory,
  listCategories,
  setCategoryActive,
  updateCategory,
} from "@/lib/domain/catalog/category-service";
import {
  createUnitOfMeasure,
  getUnitOfMeasure,
  setUnitOfMeasureActive,
} from "@/lib/domain/catalog/unit-of-measure-service";
import { CategoryNotFoundError, createProduct, getProduct, setProductActive } from "@/lib/domain/catalog/product-service";
import { createProductUnit, setProductUnitActive } from "@/lib/domain/catalog/product-unit-service";
import { DuplicateValueError } from "@/lib/domain/catalog/errors";

describe("seller catalog CRUD", () => {
  let tenant: SeededTenant;
  let actorUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    tenant = await seedTenant("Gamma", "gamma-crud", passwordHash);
    actorUserId = (await prismaBase.user.findUniqueOrThrow({ where: { email: tenant.sellerAdminEmail } })).id;
  }, 30_000);

  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  describe("category happy path", () => {
    it("creates, updates, deactivates and reactivates a category, auditing every step", async () => {
      const created = await createCategory(tenant.tenantId, actorUserId, {
        nameMk: "Млечни производи",
        nameEn: "Dairy",
        sortOrder: 5,
        isActive: true,
      });
      expect(created.nameEn).toBe("Dairy");

      const updated = await updateCategory(tenant.tenantId, actorUserId, created.id, {
        nameMk: "Млечни производи",
        nameEn: "Dairy Products",
        sortOrder: 6,
        isActive: true,
      });
      expect(updated.nameEn).toBe("Dairy Products");
      expect(updated.sortOrder).toBe(6);

      const deactivated = await setCategoryActive(tenant.tenantId, actorUserId, created.id, false);
      expect(deactivated.isActive).toBe(false);

      const reactivated = await setCategoryActive(tenant.tenantId, actorUserId, created.id, true);
      expect(reactivated.isActive).toBe(true);

      // RLS-protected table - must go through withTenantContext, not the
      // unscoped prismaBase, or app.current_tenant_id is never set for this
      // ad hoc query and RLS silently returns zero rows (fail-safe, per
      // design, but not what this assertion wants to observe).
      const auditEntries = await withTenantContext(tenant.tenantId, (tx) =>
        tx.auditLogEntry.findMany({
          where: { entityType: "Category", entityId: created.id },
          orderBy: { createdAt: "asc" },
        })
      );
      expect(auditEntries.map((e) => e.action)).toEqual(["CREATE", "UPDATE", "DEACTIVATE", "REACTIVATE"]);
      expect(auditEntries.every((e) => e.actorUserId === actorUserId)).toBe(true);
    });
  });

  describe("inactive records behave correctly", () => {
    it("an inactive category still appears in the seller's list and can still be fetched directly", async () => {
      const category = await createCategory(tenant.tenantId, actorUserId, {
        nameMk: "Застарено",
        nameEn: "Deprecated",
        sortOrder: 0,
        isActive: true,
      });
      await setCategoryActive(tenant.tenantId, actorUserId, category.id, false);

      const list = await listCategories(tenant.tenantId);
      const found = list.find((c) => c.id === category.id);
      expect(found).toBeDefined();
      expect(found?.isActive).toBe(false);

      const fetched = await getCategory(tenant.tenantId, category.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.isActive).toBe(false);
    });

    it("an inactive unit of measure can still be deactivated/reactivated and is still readable", async () => {
      const unit = await createUnitOfMeasure(tenant.tenantId, actorUserId, {
        code: "crate",
        labelMk: "Гајба",
        labelEn: "Crate",
        isActive: true,
      });
      const deactivated = await setUnitOfMeasureActive(tenant.tenantId, actorUserId, unit.id, false);
      expect(deactivated.isActive).toBe(false);

      const fetched = await getUnitOfMeasure(tenant.tenantId, unit.id);
      expect(fetched?.isActive).toBe(false);
    });

    it("a product can still be deactivated/reactivated and its packaging options are unaffected", async () => {
      const category = await createCategory(tenant.tenantId, actorUserId, {
        nameMk: "А",
        nameEn: "A",
        sortOrder: 0,
        isActive: true,
      });
      const unit = await createUnitOfMeasure(tenant.tenantId, actorUserId, {
        code: "ea",
        labelMk: "Парче",
        labelEn: "Each",
        isActive: true,
      });
      const product = await createProduct(tenant.tenantId, actorUserId, {
        nameMk: "Тест",
        nameEn: "Test Product",
        sku: "TEST-INACTIVE-1",
        categoryId: category.id,
        isActive: true,
      });
      const productUnit = await createProductUnit(tenant.tenantId, actorUserId, product.id, {
        unitOfMeasureId: unit.id,
        sku: "TEST-INACTIVE-1-EA",
        label: "Each",
        minOrderQty: 1,
        orderIncrement: 1,
        isDefault: true,
        isActive: true,
      });

      await setProductActive(tenant.tenantId, actorUserId, product.id, false);
      const fetchedProduct = await getProduct(tenant.tenantId, product.id);
      expect(fetchedProduct?.isActive).toBe(false);
      // The packaging option's own active state is independent of the
      // product's - deactivating the product does not implicitly touch it.
      expect(fetchedProduct?.units.find((u) => u.id === productUnit.id)?.isActive).toBe(true);

      const deactivatedUnit = await setProductUnitActive(tenant.tenantId, actorUserId, productUnit.id, false);
      expect(deactivatedUnit.isActive).toBe(false);
    });
  });

  describe("validation and business rules enforced at the domain layer", () => {
    it("rejects a duplicate unit of measure code within the same tenant", async () => {
      await createUnitOfMeasure(tenant.tenantId, actorUserId, {
        code: "dup1",
        labelMk: "А",
        labelEn: "A",
        isActive: true,
      });
      await expect(
        createUnitOfMeasure(tenant.tenantId, actorUserId, { code: "dup1", labelMk: "Б", labelEn: "B", isActive: true })
      ).rejects.toBeInstanceOf(DuplicateValueError);
    });

    it("rejects a duplicate product SKU within the same tenant", async () => {
      const category = await createCategory(tenant.tenantId, actorUserId, {
        nameMk: "Б",
        nameEn: "B",
        sortOrder: 0,
        isActive: true,
      });
      await createProduct(tenant.tenantId, actorUserId, {
        nameMk: "П1",
        nameEn: "P1",
        sku: "DUP-SKU-1",
        categoryId: category.id,
        isActive: true,
      });
      await expect(
        createProduct(tenant.tenantId, actorUserId, {
          nameMk: "П2",
          nameEn: "P2",
          sku: "DUP-SKU-1",
          categoryId: category.id,
          isActive: true,
        })
      ).rejects.toBeInstanceOf(DuplicateValueError);
    });

    it("rejects creating a product with a nonexistent category", async () => {
      await expect(
        createProduct(tenant.tenantId, actorUserId, {
          nameMk: "П",
          nameEn: "P",
          sku: "NO-CATEGORY-1",
          categoryId: "00000000-0000-0000-0000-000000000000",
          isActive: true,
        })
      ).rejects.toBeInstanceOf(CategoryNotFoundError);
    });

    it("rejects a duplicate product unit SKU within the same tenant, even across different products", async () => {
      const category = await createCategory(tenant.tenantId, actorUserId, {
        nameMk: "В",
        nameEn: "C",
        sortOrder: 0,
        isActive: true,
      });
      const unit = await createUnitOfMeasure(tenant.tenantId, actorUserId, {
        code: "pc2",
        labelMk: "Парче",
        labelEn: "Piece",
        isActive: true,
      });
      const productA = await createProduct(tenant.tenantId, actorUserId, {
        nameMk: "П1",
        nameEn: "Product A",
        sku: "PU-DUP-PRODUCT-A",
        categoryId: category.id,
        isActive: true,
      });
      const productB = await createProduct(tenant.tenantId, actorUserId, {
        nameMk: "П2",
        nameEn: "Product B",
        sku: "PU-DUP-PRODUCT-B",
        categoryId: category.id,
        isActive: true,
      });

      await createProductUnit(tenant.tenantId, actorUserId, productA.id, {
        unitOfMeasureId: unit.id,
        sku: "SHARED-PU-SKU",
        label: "Piece",
        minOrderQty: 1,
        orderIncrement: 1,
        isDefault: true,
        isActive: true,
      });

      await expect(
        createProductUnit(tenant.tenantId, actorUserId, productB.id, {
          unitOfMeasureId: unit.id,
          sku: "SHARED-PU-SKU",
          label: "Piece",
          minOrderQty: 1,
          orderIncrement: 1,
          isDefault: true,
          isActive: true,
        })
      ).rejects.toBeInstanceOf(DuplicateValueError);
    });

    it("updating a product to an inactive category is allowed (no cascading restriction in Phase 1A)", async () => {
      const category = await createCategory(tenant.tenantId, actorUserId, {
        nameMk: "Г",
        nameEn: "D",
        sortOrder: 0,
        isActive: false,
      });
      const product = await createProduct(tenant.tenantId, actorUserId, {
        nameMk: "П",
        nameEn: "Product under inactive category",
        sku: "UNDER-INACTIVE-CAT",
        categoryId: category.id,
        isActive: true,
      });
      expect(product.categoryId).toBe(category.id);
    });
  });
});
