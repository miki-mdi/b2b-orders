import { z } from "zod";
import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import { createCategoryInTx, updateCategoryInTx } from "@/lib/domain/catalog/category-service";
import type { EntityImportOps } from "./driver";
import { isColumnPresent, parseBooleanCell, parseOptionalNumberCell, pushZodErrors, readCell } from "./normalize-helpers";
import type { ImportRowError } from "./types";

/**
 * Mirrors validation/catalog.ts's categoryInputSchema field rules, but
 * `code` is REQUIRED here (unlike the manual form) - it's the import's
 * business key (requirement #4), and "otherwise require/add a stable code"
 * is exactly what Phase 1F-A's brief asked for. Kept as its own schema
 * (not a reused/relaxed categoryInputSchema) because the manual form's
 * `code` is optional by design - the two schemas serve genuinely different
 * required-ness contracts, not an accidental duplication.
 */
const categoryImportRowSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(40, "Code must be 40 characters or fewer")
    .regex(/^[a-zA-Z0-9._-]+$/, "Code may only contain letters, numbers, dots, dashes and underscores"),
  nameMk: z.string().trim().min(1, "Macedonian name is required").max(200),
  nameEn: z.string().trim().min(1, "English name is required").max(200),
  description: z.string().trim().max(2000).optional(),
  sortOrder: z.number().int("Sort order must be a whole number").min(0).max(100_000),
  isActive: z.boolean(),
});

type CategoryRow = z.infer<typeof categoryImportRowSchema>;
type CategoryExisting = { id: string; nameMk: string; nameEn: string; description: string | null; sortOrder: number; isActive: boolean };

export function createCategoryImportOps(headers: string[]): EntityImportOps<CategoryRow, CategoryExisting> {
  const index = new Map(headers.map((h, i) => [h, i]));

  return {
    normalizeRow(row) {
      const errors: ImportRowError[] = [];
      const sortOrder = parseOptionalNumberCell(readCell(row, index, "sortOrder"), "sortOrder", errors) ?? 0;
      const isActive = parseBooleanCell(readCell(row, index, "isActive"), true, "isActive", errors);
      const result = categoryImportRowSchema.safeParse({
        code: readCell(row, index, "code") ?? "",
        nameMk: readCell(row, index, "nameMk") ?? "",
        nameEn: readCell(row, index, "nameEn") ?? "",
        description: readCell(row, index, "description") || undefined,
        sortOrder,
        isActive,
      });
      if (!result.success) {
        pushZodErrors(errors, result.error);
        return { errors, warnings: [] };
      }
      return { data: result.data, errors, warnings: [] };
    },

    keyOf: (data) => `code=${data.code}`,

    async resolve(tx: ScopedTransactionClient, _tenantId, data) {
      const existing = await tx.category.findFirst({ where: { code: data.code } });
      return { refs: undefined, existing, errors: [] };
    },

    diff(existing, data) {
      const updateData: CategoryRow = { ...data };
      if (!isColumnPresent(index, "description")) updateData.description = existing.description ?? undefined;
      if (!isColumnPresent(index, "sortOrder")) updateData.sortOrder = existing.sortOrder;
      if (!isColumnPresent(index, "isActive")) updateData.isActive = existing.isActive;

      const changedFields: string[] = [];
      if (existing.nameMk !== updateData.nameMk) changedFields.push("nameMk");
      if (existing.nameEn !== updateData.nameEn) changedFields.push("nameEn");
      if ((existing.description ?? "") !== (updateData.description ?? "")) changedFields.push("description");
      if (existing.sortOrder !== updateData.sortOrder) changedFields.push("sortOrder");
      if (existing.isActive !== updateData.isActive) changedFields.push("isActive");

      return { changed: changedFields.length > 0, changedFields, updateData };
    },

    async executeCreate(tx, tenantId, actorUserId, data, _refs, reason) {
      const created = await createCategoryInTx(tx, tenantId, actorUserId, data, reason);
      return { id: created.id };
    },

    async executeUpdate(tx, tenantId, actorUserId, existing, updateData, _refs, reason) {
      const updated = await updateCategoryInTx(tx, tenantId, actorUserId, existing.id, updateData, reason);
      return { id: updated.id };
    },
  };
}
