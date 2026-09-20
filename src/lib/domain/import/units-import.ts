import { z } from "zod";
import { createUnitOfMeasureInTx, updateUnitOfMeasureInTx } from "@/lib/domain/catalog/unit-of-measure-service";
import type { EntityImportOps } from "./driver";
import { isColumnPresent, parseBooleanCell, pushZodErrors, readCell } from "./normalize-helpers";
import type { ImportRowError } from "./types";

/** Mirrors validation/catalog.ts's unitOfMeasureInputSchema - `code` is already required in the manual form, so no relaxed/tightened variant is needed here unlike categories/customers/price-lists. */
const unitImportRowSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(10, "Code must be 10 characters or fewer")
    .regex(/^[a-zA-Z0-9._-]+$/, "Code may only contain letters, numbers, dots, dashes and underscores"),
  labelMk: z.string().trim().min(1, "Macedonian label is required").max(100),
  labelEn: z.string().trim().min(1, "English label is required").max(100),
  isActive: z.boolean(),
});

type UnitRow = z.infer<typeof unitImportRowSchema>;
type UnitExisting = { id: string; labelMk: string; labelEn: string; isActive: boolean };

export function createUnitImportOps(headers: string[]): EntityImportOps<UnitRow, UnitExisting> {
  const index = new Map(headers.map((h, i) => [h, i]));

  return {
    normalizeRow(row) {
      const errors: ImportRowError[] = [];
      const isActive = parseBooleanCell(readCell(row, index, "isActive"), true, "isActive", errors);
      const result = unitImportRowSchema.safeParse({
        code: readCell(row, index, "code") ?? "",
        labelMk: readCell(row, index, "labelMk") ?? "",
        labelEn: readCell(row, index, "labelEn") ?? "",
        isActive,
      });
      if (!result.success) {
        pushZodErrors(errors, result.error);
        return { errors, warnings: [] };
      }
      return { data: result.data, errors, warnings: [] };
    },

    keyOf: (data) => `code=${data.code}`,

    async resolve(tx, _tenantId, data) {
      const existing = await tx.unitOfMeasure.findFirst({ where: { code: data.code } });
      return { refs: undefined, existing, errors: [] };
    },

    diff(existing, data) {
      const updateData: UnitRow = { ...data };
      if (!isColumnPresent(index, "isActive")) updateData.isActive = existing.isActive;

      const changedFields: string[] = [];
      if (existing.labelMk !== updateData.labelMk) changedFields.push("labelMk");
      if (existing.labelEn !== updateData.labelEn) changedFields.push("labelEn");
      if (existing.isActive !== updateData.isActive) changedFields.push("isActive");

      return { changed: changedFields.length > 0, changedFields, updateData };
    },

    async executeCreate(tx, tenantId, actorUserId, data, _refs, reason) {
      const created = await createUnitOfMeasureInTx(tx, tenantId, actorUserId, data, reason);
      return { id: created.id };
    },

    async executeUpdate(tx, tenantId, actorUserId, existing, updateData, _refs, reason) {
      const updated = await updateUnitOfMeasureInTx(tx, tenantId, actorUserId, existing.id, updateData, reason);
      return { id: updated.id };
    },
  };
}
