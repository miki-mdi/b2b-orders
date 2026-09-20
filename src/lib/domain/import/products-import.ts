import { z } from "zod";
import type { ProductInput } from "@/lib/validation/catalog";
import { createProductInTx, updateProductInTx } from "@/lib/domain/catalog/product-service";
import type { EntityImportOps } from "./driver";
import { isColumnPresent, parseBooleanCell, parseOptionalNumberCell, pushZodErrors, readCell } from "./normalize-helpers";
import type { ImportRowError } from "./types";

/**
 * Mirrors validation/catalog.ts's productInputSchema, minus `categoryId` -
 * the import resolves `categoryCode` (a tenant-scoped lookup, see resolve()
 * below) into an id itself rather than trusting an id straight from the
 * file (requirement #6). `categoryCode` is required here even though
 * Product.categoryId is nullable at the DB level, because the existing
 * manual create/update path (product-service.ts's ProductInput) already
 * requires a category for every product - import follows that same rule
 * rather than relaxing it.
 */
const productImportRowSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, "SKU is required")
    .max(64, "SKU must be 64 characters or fewer")
    .regex(/^[a-zA-Z0-9._-]+$/, "SKU may only contain letters, numbers, dots, dashes and underscores"),
  nameMk: z.string().trim().min(1, "Macedonian name is required").max(300),
  nameEn: z.string().trim().min(1, "English name is required").max(300),
  categoryCode: z.string().trim().min(1, "Category code is required").max(40),
  description: z.string().trim().max(4000).optional(),
  barcode: z.string().trim().max(64).optional(),
  defaultVatRate: z.number().min(0, "VAT rate cannot be negative").max(100, "VAT rate cannot exceed 100").optional(),
  isActive: z.boolean(),
});

type ProductRow = z.infer<typeof productImportRowSchema>;
type ProductExisting = {
  id: string;
  categoryId: string | null;
  nameMk: string;
  nameEn: string;
  description: string | null;
  barcode: string | null;
  imageUrl: string | null;
  defaultVatRate: unknown;
  isActive: boolean;
};

export function createProductImportOps(headers: string[]): EntityImportOps<ProductRow, ProductExisting> {
  const index = new Map(headers.map((h, i) => [h, i]));

  return {
    normalizeRow(row) {
      const errors: ImportRowError[] = [];
      const isActive = parseBooleanCell(readCell(row, index, "isActive"), true, "isActive", errors);
      const defaultVatRate = parseOptionalNumberCell(readCell(row, index, "defaultVatRate"), "defaultVatRate", errors);
      const result = productImportRowSchema.safeParse({
        sku: readCell(row, index, "sku") ?? "",
        nameMk: readCell(row, index, "nameMk") ?? "",
        nameEn: readCell(row, index, "nameEn") ?? "",
        categoryCode: readCell(row, index, "categoryCode") ?? "",
        description: readCell(row, index, "description") || undefined,
        barcode: readCell(row, index, "barcode") || undefined,
        defaultVatRate,
        isActive,
      });
      if (!result.success) {
        pushZodErrors(errors, result.error);
        return { errors, warnings: [] };
      }
      return { data: result.data, errors, warnings: [] };
    },

    keyOf: (data) => `sku=${data.sku}`,

    async resolve(tx, _tenantId, data) {
      const errors: ImportRowError[] = [];
      const [category, existing] = await Promise.all([
        tx.category.findFirst({ where: { code: data.categoryCode } }),
        tx.product.findFirst({ where: { sku: data.sku } }),
      ]);
      if (!category) {
        errors.push({
          field: "categoryCode",
          code: "REFERENCE_NOT_FOUND",
          message: `No category with code "${data.categoryCode}" was found for this tenant.`,
        });
      }
      return { refs: { categoryId: category?.id }, existing, errors };
    },

    diff(existing, data, refs) {
      const { categoryId } = refs as { categoryId?: string };
      const updateData: ProductRow = { ...data };
      if (!isColumnPresent(index, "description")) updateData.description = existing.description ?? undefined;
      if (!isColumnPresent(index, "barcode")) updateData.barcode = existing.barcode ?? undefined;
      if (!isColumnPresent(index, "defaultVatRate")) {
        updateData.defaultVatRate = existing.defaultVatRate != null ? Number(existing.defaultVatRate) : undefined;
      }
      if (!isColumnPresent(index, "isActive")) updateData.isActive = existing.isActive;

      const changedFields: string[] = [];
      if (existing.nameMk !== updateData.nameMk) changedFields.push("nameMk");
      if (existing.nameEn !== updateData.nameEn) changedFields.push("nameEn");
      if (existing.categoryId !== categoryId) changedFields.push("categoryCode");
      if ((existing.description ?? "") !== (updateData.description ?? "")) changedFields.push("description");
      if ((existing.barcode ?? "") !== (updateData.barcode ?? "")) changedFields.push("barcode");
      const existingVat = existing.defaultVatRate != null ? Number(existing.defaultVatRate) : undefined;
      if (existingVat !== updateData.defaultVatRate) changedFields.push("defaultVatRate");
      if (existing.isActive !== updateData.isActive) changedFields.push("isActive");

      return { changed: changedFields.length > 0, changedFields, updateData };
    },

    async executeCreate(tx, tenantId, actorUserId, data, refs, reason) {
      const { categoryId } = refs as { categoryId?: string };
      const input: ProductInput = { ...data, categoryId: categoryId as string };
      const created = await createProductInTx(tx, tenantId, actorUserId, input, reason);
      return { id: created.id };
    },

    async executeUpdate(tx, tenantId, actorUserId, existing, updateData, refs, reason) {
      const { categoryId } = refs as { categoryId?: string };
      const input: ProductInput = { ...updateData, categoryId: categoryId as string };
      const updated = await updateProductInTx(tx, tenantId, actorUserId, existing.id, input, reason);
      return { id: updated.id };
    },
  };
}
