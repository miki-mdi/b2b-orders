import { z } from "zod";
import type { CustomerInput } from "@/lib/validation/customers";
import { createCustomerInTx, updateCustomerInTx } from "@/lib/domain/customers/customer-service";
import { setCustomerDiscountInTx } from "@/lib/domain/customers/customer-discount-service";
import type { EntityImportOps } from "./driver";
import { isColumnPresent, parseBooleanCell, parseOptionalNumberCell, pushZodErrors, readCell } from "./normalize-helpers";
import type { ImportRowError } from "./types";

/**
 * Mirrors validation/customers.ts's customerInputSchema, with `code`
 * REQUIRED (the import key, unlike the optional manual-form field) and one
 * addition: `discountPercent` isn't part of CustomerInput at all - the
 * manual UI treats it as a separate concern via customer-discount-service.ts
 * (its own audit trail entry). Import keeps that separation but still needs
 * full 3-state presence semantics for it (unset/clear/set), so it's typed
 * `nullable().optional()` here: undefined = column absent from the file
 * (leave the existing discount alone), null = column present but blank
 * (clear it), a number = set it.
 */
const customerImportRowSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(40, "Code must be 40 characters or fewer")
    .regex(/^[a-zA-Z0-9._-]+$/, "Code may only contain letters, numbers, dots, dashes and underscores"),
  name: z.string().trim().min(1, "Name is required").max(300),
  taxId: z.string().trim().max(40).optional(),
  contactEmail: z.string().trim().max(200).email("Must be a valid email address").optional(),
  contactPhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(4000).optional(),
  creditLimit: z.number().min(0, "Credit limit cannot be negative").max(9_999_999_999).optional(),
  paymentTermsDays: z.number().int("Payment terms must be a whole number of days").min(0).max(3650).optional(),
  isActive: z.boolean(),
  discountPercent: z.number().min(0, "Discount cannot be negative").max(100, "Discount cannot exceed 100%").nullable().optional(),
});

type CustomerRow = z.infer<typeof customerImportRowSchema>;
type CustomerExisting = {
  id: string;
  name: string;
  taxId: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  creditLimit: unknown;
  paymentTermsDays: number | null;
  isActive: boolean;
  discountPercent: unknown;
};

export function createCustomerImportOps(headers: string[]): EntityImportOps<CustomerRow, CustomerExisting> {
  const index = new Map(headers.map((h, i) => [h, i]));

  return {
    normalizeRow(row) {
      const errors: ImportRowError[] = [];
      const isActive = parseBooleanCell(readCell(row, index, "isActive"), true, "isActive", errors);
      const creditLimit = parseOptionalNumberCell(readCell(row, index, "creditLimit"), "creditLimit", errors);
      const paymentTermsDays = parseOptionalNumberCell(readCell(row, index, "paymentTermsDays"), "paymentTermsDays", errors);

      const discountRaw = readCell(row, index, "discountPercent");
      let discountPercent: number | null | undefined;
      if (discountRaw === undefined) discountPercent = undefined;
      else if (discountRaw === "") discountPercent = null;
      else discountPercent = parseOptionalNumberCell(discountRaw, "discountPercent", errors) ?? null;

      const result = customerImportRowSchema.safeParse({
        code: readCell(row, index, "code") ?? "",
        name: readCell(row, index, "name") ?? "",
        taxId: readCell(row, index, "taxId") || undefined,
        contactEmail: readCell(row, index, "contactEmail") || undefined,
        contactPhone: readCell(row, index, "contactPhone") || undefined,
        notes: readCell(row, index, "notes") || undefined,
        creditLimit,
        paymentTermsDays,
        isActive,
        discountPercent,
      });
      if (!result.success) {
        pushZodErrors(errors, result.error);
        return { errors, warnings: [] };
      }
      return { data: result.data, errors, warnings: [] };
    },

    keyOf: (data) => `code=${data.code}`,

    async resolve(tx, _tenantId, data) {
      const existing = await tx.customer.findFirst({ where: { code: data.code } });
      return { refs: undefined, existing, errors: [] };
    },

    diff(existing, data) {
      const updateData: CustomerRow = { ...data };
      if (!isColumnPresent(index, "taxId")) updateData.taxId = existing.taxId ?? undefined;
      if (!isColumnPresent(index, "contactEmail")) updateData.contactEmail = existing.contactEmail ?? undefined;
      if (!isColumnPresent(index, "contactPhone")) updateData.contactPhone = existing.contactPhone ?? undefined;
      if (!isColumnPresent(index, "notes")) updateData.notes = existing.notes ?? undefined;
      if (!isColumnPresent(index, "creditLimit")) updateData.creditLimit = existing.creditLimit != null ? Number(existing.creditLimit) : undefined;
      if (!isColumnPresent(index, "paymentTermsDays")) updateData.paymentTermsDays = existing.paymentTermsDays ?? undefined;
      if (!isColumnPresent(index, "isActive")) updateData.isActive = existing.isActive;
      // discountPercent's presence semantics were already fully resolved in
      // normalizeRow (undefined/null/number) - nothing to restore here.

      const changedFields: string[] = [];
      if (existing.name !== updateData.name) changedFields.push("name");
      if ((existing.taxId ?? "") !== (updateData.taxId ?? "")) changedFields.push("taxId");
      if ((existing.contactEmail ?? "") !== (updateData.contactEmail ?? "")) changedFields.push("contactEmail");
      if ((existing.contactPhone ?? "") !== (updateData.contactPhone ?? "")) changedFields.push("contactPhone");
      if ((existing.notes ?? "") !== (updateData.notes ?? "")) changedFields.push("notes");
      const existingCredit = existing.creditLimit != null ? Number(existing.creditLimit) : undefined;
      if (existingCredit !== updateData.creditLimit) changedFields.push("creditLimit");
      if ((existing.paymentTermsDays ?? undefined) !== updateData.paymentTermsDays) changedFields.push("paymentTermsDays");
      if (existing.isActive !== updateData.isActive) changedFields.push("isActive");
      if (updateData.discountPercent !== undefined) {
        const existingDiscount = existing.discountPercent != null ? Number(existing.discountPercent) : null;
        if (existingDiscount !== updateData.discountPercent) changedFields.push("discountPercent");
      }

      return { changed: changedFields.length > 0, changedFields, updateData };
    },

    async executeCreate(tx, tenantId, actorUserId, data, _refs, reason) {
      const { discountPercent, ...customerInput } = data;
      const created = await createCustomerInTx(tx, tenantId, actorUserId, customerInput as CustomerInput, reason);
      if (discountPercent !== undefined) {
        await setCustomerDiscountInTx(tx, tenantId, actorUserId, created.id, discountPercent, reason);
      }
      return { id: created.id };
    },

    async executeUpdate(tx, tenantId, actorUserId, existing, updateData, _refs, reason) {
      const { discountPercent, ...customerInput } = updateData;
      const updated = await updateCustomerInTx(tx, tenantId, actorUserId, existing.id, customerInput as CustomerInput, reason);
      if (discountPercent !== undefined) {
        await setCustomerDiscountInTx(tx, tenantId, actorUserId, existing.id, discountPercent, reason);
      }
      return { id: updated.id };
    },
  };
}
