import { z } from "zod";
import type { ProductUnitInput } from "@/lib/validation/catalog";
import { createProductUnitInTx, updateProductUnitInTx } from "@/lib/domain/catalog/product-unit-service";
import type { EntityImportOps } from "./driver";
import { isColumnPresent, parseBooleanCell, parseOptionalNumberCell, pushZodErrors, readCell } from "./normalize-helpers";
import type { ImportRowError } from "./types";

/** Mirrors validation/catalog.ts's productUnitInputSchema, minus `unitOfMeasureId` (resolved from `unitOfMeasureCode`, see resolve()). `productSku` isn't part of the manual form's input type at all - a ProductUnit's parent Product is fixed at creation and never changes via the manual UI either, so import follows the same rule (see resolve()'s reparent check). */
const productUnitImportRowSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1, "SKU is required")
      .max(64, "SKU must be 64 characters or fewer")
      .regex(/^[a-zA-Z0-9._-]+$/, "SKU may only contain letters, numbers, dots, dashes and underscores"),
    productSku: z.string().trim().min(1, "Product SKU is required").max(64),
    unitOfMeasureCode: z.string().trim().min(1, "Unit of measure code is required").max(10),
    label: z.string().trim().min(1, "Label is required").max(100),
    barcode: z.string().trim().max(64).optional(),
    conversionFactorToBase: z.number().positive("Conversion factor must be greater than zero").optional(),
    minOrderQty: z.number({ message: "Minimum order quantity must be a number" }).positive("Minimum order quantity must be greater than zero"),
    orderIncrement: z.number({ message: "Order increment must be a number" }).positive("Order increment must be greater than zero"),
    isDefault: z.boolean(),
    isActive: z.boolean(),
  })
  .refine((data) => data.minOrderQty >= data.orderIncrement, {
    message: "Minimum order quantity cannot be smaller than the order increment",
    path: ["minOrderQty"],
  });

type ProductUnitRow = z.infer<typeof productUnitImportRowSchema>;
type ProductUnitExisting = {
  id: string;
  productId: string;
  unitOfMeasureId: string;
  label: string;
  barcode: string | null;
  conversionFactorToBase: unknown;
  minOrderQty: unknown;
  orderIncrement: unknown;
  isDefault: boolean;
  isActive: boolean;
};

export function createProductUnitImportOps(headers: string[]): EntityImportOps<ProductUnitRow, ProductUnitExisting> {
  const index = new Map(headers.map((h, i) => [h, i]));

  return {
    normalizeRow(row) {
      const errors: ImportRowError[] = [];
      const isDefault = parseBooleanCell(readCell(row, index, "isDefault"), true, "isDefault", errors);
      const isActive = parseBooleanCell(readCell(row, index, "isActive"), true, "isActive", errors);
      const conversionFactorToBase = parseOptionalNumberCell(readCell(row, index, "conversionFactorToBase"), "conversionFactorToBase", errors);
      const minOrderQty = parseOptionalNumberCell(readCell(row, index, "minOrderQty"), "minOrderQty", errors) ?? 1;
      const orderIncrement = parseOptionalNumberCell(readCell(row, index, "orderIncrement"), "orderIncrement", errors) ?? 1;

      const result = productUnitImportRowSchema.safeParse({
        sku: readCell(row, index, "sku") ?? "",
        productSku: readCell(row, index, "productSku") ?? "",
        unitOfMeasureCode: readCell(row, index, "unitOfMeasureCode") ?? "",
        label: readCell(row, index, "label") ?? "",
        barcode: readCell(row, index, "barcode") || undefined,
        conversionFactorToBase,
        minOrderQty,
        orderIncrement,
        isDefault,
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
      const [product, unit, existing] = await Promise.all([
        tx.product.findFirst({ where: { sku: data.productSku } }),
        tx.unitOfMeasure.findFirst({ where: { code: data.unitOfMeasureCode } }),
        tx.productUnit.findFirst({ where: { sku: data.sku } }),
      ]);
      if (!product) {
        errors.push({ field: "productSku", code: "REFERENCE_NOT_FOUND", message: `No product with SKU "${data.productSku}" was found for this tenant.` });
      }
      if (!unit) {
        errors.push({
          field: "unitOfMeasureCode",
          code: "REFERENCE_NOT_FOUND",
          message: `No unit of measure with code "${data.unitOfMeasureCode}" was found for this tenant.`,
        });
      }
      if (existing && product && existing.productId !== product.id) {
        errors.push({
          field: "productSku",
          code: "CANNOT_REPARENT",
          message: `This product unit already belongs to a different product. Import cannot move it to product SKU "${data.productSku}".`,
        });
      }
      return { refs: { productId: product?.id, unitOfMeasureId: unit?.id }, existing, errors };
    },

    diff(existing, data, refs) {
      const { unitOfMeasureId } = refs as { productId?: string; unitOfMeasureId?: string };
      const updateData: ProductUnitRow = { ...data };
      if (!isColumnPresent(index, "barcode")) updateData.barcode = existing.barcode ?? undefined;
      if (!isColumnPresent(index, "conversionFactorToBase")) {
        updateData.conversionFactorToBase = existing.conversionFactorToBase != null ? Number(existing.conversionFactorToBase) : undefined;
      }
      if (!isColumnPresent(index, "minOrderQty")) updateData.minOrderQty = Number(existing.minOrderQty);
      if (!isColumnPresent(index, "orderIncrement")) updateData.orderIncrement = Number(existing.orderIncrement);
      if (!isColumnPresent(index, "isDefault")) updateData.isDefault = existing.isDefault;
      if (!isColumnPresent(index, "isActive")) updateData.isActive = existing.isActive;

      const changedFields: string[] = [];
      if (existing.unitOfMeasureId !== unitOfMeasureId) changedFields.push("unitOfMeasureCode");
      if (existing.label !== updateData.label) changedFields.push("label");
      if ((existing.barcode ?? "") !== (updateData.barcode ?? "")) changedFields.push("barcode");
      const existingConv = existing.conversionFactorToBase != null ? Number(existing.conversionFactorToBase) : undefined;
      if (existingConv !== updateData.conversionFactorToBase) changedFields.push("conversionFactorToBase");
      if (Number(existing.minOrderQty) !== updateData.minOrderQty) changedFields.push("minOrderQty");
      if (Number(existing.orderIncrement) !== updateData.orderIncrement) changedFields.push("orderIncrement");
      if (existing.isDefault !== updateData.isDefault) changedFields.push("isDefault");
      if (existing.isActive !== updateData.isActive) changedFields.push("isActive");

      return { changed: changedFields.length > 0, changedFields, updateData };
    },

    async executeCreate(tx, tenantId, actorUserId, data, refs, reason) {
      const { productId, unitOfMeasureId } = refs as { productId?: string; unitOfMeasureId?: string };
      const input: ProductUnitInput = { ...data, unitOfMeasureId: unitOfMeasureId as string };
      const created = await createProductUnitInTx(tx, tenantId, actorUserId, productId as string, input, reason);
      return { id: created.id };
    },

    async executeUpdate(tx, tenantId, actorUserId, existing, updateData, refs, reason) {
      const { unitOfMeasureId } = refs as { unitOfMeasureId?: string };
      const input: ProductUnitInput = { ...updateData, unitOfMeasureId: unitOfMeasureId as string };
      const updated = await updateProductUnitInTx(tx, tenantId, actorUserId, existing.id, input, reason);
      return { id: updated.id };
    },
  };
}
