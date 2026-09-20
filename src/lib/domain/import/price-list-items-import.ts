import { z } from "zod";
import { createPriceListItemInTx, updatePriceListItemInTx } from "@/lib/domain/pricing/price-list-item-service";
import type { EntityImportOps } from "./driver";
import { parseOptionalNumberCell, pushZodErrors, readCell } from "./normalize-helpers";
import type { ImportRowError } from "./types";

/** Mirrors validation/pricing.ts's priceListItemInputSchema, with `productUnitId` replaced by `productUnitSku`/`priceListCode` - both resolved to tenant-scoped ids in resolve() (requirement #6), never trusted as ids directly. The import key is (priceListCode, productUnitSku) together, matching the underlying @@unique([priceListId, productUnitId]) constraint. */
const priceListItemImportRowSchema = z.object({
  priceListCode: z.string().trim().min(1, "Price list code is required").max(40),
  productUnitSku: z.string().trim().min(1, "Product unit SKU is required").max(64),
  price: z.number({ message: "Price must be a number" }).positive("Price must be greater than zero"),
});

type PriceListItemRow = z.infer<typeof priceListItemImportRowSchema>;
type PriceListItemExisting = { id: string; price: unknown };

export function createPriceListItemImportOps(headers: string[]): EntityImportOps<PriceListItemRow, PriceListItemExisting> {
  const index = new Map(headers.map((h, i) => [h, i]));

  return {
    normalizeRow(row) {
      const errors: ImportRowError[] = [];
      const price = parseOptionalNumberCell(readCell(row, index, "price"), "price", errors);

      const result = priceListItemImportRowSchema.safeParse({
        priceListCode: readCell(row, index, "priceListCode") ?? "",
        productUnitSku: readCell(row, index, "productUnitSku") ?? "",
        price,
      });
      if (!result.success) {
        pushZodErrors(errors, result.error);
        return { errors, warnings: [] };
      }
      return { data: result.data, errors, warnings: [] };
    },

    keyOf: (data) => `priceListCode=${data.priceListCode},productUnitSku=${data.productUnitSku}`,

    async resolve(tx, _tenantId, data) {
      const errors: ImportRowError[] = [];
      const [priceList, productUnit] = await Promise.all([
        tx.priceList.findFirst({ where: { code: data.priceListCode } }),
        tx.productUnit.findFirst({ where: { sku: data.productUnitSku } }),
      ]);
      if (!priceList) {
        errors.push({ field: "priceListCode", code: "REFERENCE_NOT_FOUND", message: `No price list with code "${data.priceListCode}" was found for this tenant.` });
      }
      if (!productUnit) {
        errors.push({ field: "productUnitSku", code: "REFERENCE_NOT_FOUND", message: `No product unit with SKU "${data.productUnitSku}" was found for this tenant.` });
      }
      if (!priceList || !productUnit) {
        return { refs: { priceListId: priceList?.id, productUnitId: productUnit?.id }, existing: null, errors };
      }
      const existing = await tx.priceListItem.findFirst({ where: { priceListId: priceList.id, productUnitId: productUnit.id } });
      return { refs: { priceListId: priceList.id, productUnitId: productUnit.id }, existing, errors };
    },

    diff(existing, data) {
      const changedFields: string[] = [];
      if (Number(existing.price) !== data.price) changedFields.push("price");
      return { changed: changedFields.length > 0, changedFields, updateData: data };
    },

    async executeCreate(tx, tenantId, actorUserId, data, refs, reason) {
      const { priceListId, productUnitId } = refs as { priceListId?: string; productUnitId?: string };
      const created = await createPriceListItemInTx(tx, tenantId, actorUserId, priceListId as string, { productUnitId: productUnitId as string, price: data.price }, reason);
      return { id: created.id };
    },

    async executeUpdate(tx, tenantId, actorUserId, existing, updateData, _refs, reason) {
      const updated = await updatePriceListItemInTx(tx, tenantId, actorUserId, existing.id, { price: updateData.price }, reason);
      return { id: updated.id };
    },
  };
}
