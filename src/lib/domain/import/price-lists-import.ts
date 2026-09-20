import { z } from "zod";
import { createPriceListInTx, updatePriceListInTx } from "@/lib/domain/pricing/price-list-service";
import type { EntityImportOps } from "./driver";
import { isColumnPresent, parseBooleanCell, pushZodErrors, readCell } from "./normalize-helpers";
import type { ImportRowError } from "./types";

/** Mirrors validation/pricing.ts's priceListInputSchema, with `code` REQUIRED (the import key, unlike the manual form's optional field). */
const priceListImportRowSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(40, "Code must be 40 characters or fewer"),
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code, e.g. MKD"),
  isDefault: z.boolean(),
  isActive: z.boolean(),
});

type PriceListRow = z.infer<typeof priceListImportRowSchema>;
type PriceListExisting = { id: string; name: string; description: string | null; currency: string; isDefault: boolean; isActive: boolean };

export function createPriceListImportOps(headers: string[]): EntityImportOps<PriceListRow, PriceListExisting> {
  const index = new Map(headers.map((h, i) => [h, i]));

  return {
    normalizeRow(row) {
      const errors: ImportRowError[] = [];
      const isDefault = parseBooleanCell(readCell(row, index, "isDefault"), false, "isDefault", errors);
      const isActive = parseBooleanCell(readCell(row, index, "isActive"), true, "isActive", errors);
      const currencyRaw = readCell(row, index, "currency");

      const result = priceListImportRowSchema.safeParse({
        code: readCell(row, index, "code") ?? "",
        name: readCell(row, index, "name") ?? "",
        description: readCell(row, index, "description") || undefined,
        currency: currencyRaw || "MKD",
        isDefault,
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
      const existing = await tx.priceList.findFirst({ where: { code: data.code } });
      return { refs: undefined, existing, errors: [] };
    },

    diff(existing, data) {
      const updateData: PriceListRow = { ...data };
      if (!isColumnPresent(index, "description")) updateData.description = existing.description ?? undefined;
      if (!isColumnPresent(index, "currency")) updateData.currency = existing.currency;
      if (!isColumnPresent(index, "isDefault")) updateData.isDefault = existing.isDefault;
      if (!isColumnPresent(index, "isActive")) updateData.isActive = existing.isActive;

      const changedFields: string[] = [];
      if (existing.name !== updateData.name) changedFields.push("name");
      if ((existing.description ?? "") !== (updateData.description ?? "")) changedFields.push("description");
      if (existing.currency !== updateData.currency) changedFields.push("currency");
      if (existing.isDefault !== updateData.isDefault) changedFields.push("isDefault");
      if (existing.isActive !== updateData.isActive) changedFields.push("isActive");

      return { changed: changedFields.length > 0, changedFields, updateData };
    },

    async executeCreate(tx, tenantId, actorUserId, data, _refs, reason) {
      const created = await createPriceListInTx(tx, tenantId, actorUserId, data, reason);
      return { id: created.id };
    },

    async executeUpdate(tx, tenantId, actorUserId, existing, updateData, _refs, reason) {
      const updated = await updatePriceListInTx(tx, tenantId, actorUserId, existing.id, updateData, reason);
      return { id: updated.id };
    },
  };
}
