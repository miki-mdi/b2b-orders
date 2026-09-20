import { z } from "zod";
import type { CustomerAddressInput } from "@/lib/validation/customers";
import { createCustomerAddressInTx, updateCustomerAddressInTx } from "@/lib/domain/customers/customer-address-service";
import type { EntityImportOps } from "./driver";
import { isColumnPresent, parseBooleanCell, pushZodErrors, readCell } from "./normalize-helpers";
import type { ImportRowError } from "./types";

/** Mirrors validation/customers.ts's customerAddressInputSchema, plus `customerCode` (resolved to a tenant-scoped customerId in resolve(), never trusted as an id directly - requirement #6). The import key is (customerCode, label) together - see the new @@unique([customerId, label]) constraint added for Phase 1F-A. */
const customerAddressImportRowSchema = z.object({
  customerCode: z.string().trim().min(1, "Customer code is required").max(40),
  label: z.string().trim().min(1, "Label is required").max(100),
  recipientName: z.string().trim().min(1, "Contact person is required").max(200),
  phone: z.string().trim().max(40).optional(),
  addressLine1: z.string().trim().min(1, "Street address is required").max(300),
  addressLine2: z.string().trim().max(300).optional(),
  city: z.string().trim().min(1, "City is required").max(150),
  postalCode: z.string().trim().max(20).optional(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Country must be a 2-letter code, e.g. MK"),
  isDefaultDelivery: z.boolean(),
  isDefaultBilling: z.boolean(),
  isActive: z.boolean(),
});

type CustomerAddressRow = z.infer<typeof customerAddressImportRowSchema>;
type CustomerAddressExisting = {
  id: string;
  customerId: string;
  recipientName: string;
  phone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postalCode: string | null;
  country: string;
  isDefaultDelivery: boolean;
  isDefaultBilling: boolean;
  isActive: boolean;
};

export function createCustomerAddressImportOps(headers: string[]): EntityImportOps<CustomerAddressRow, CustomerAddressExisting> {
  const index = new Map(headers.map((h, i) => [h, i]));

  return {
    normalizeRow(row) {
      const errors: ImportRowError[] = [];
      const isDefaultDelivery = parseBooleanCell(readCell(row, index, "isDefaultDelivery"), false, "isDefaultDelivery", errors);
      const isDefaultBilling = parseBooleanCell(readCell(row, index, "isDefaultBilling"), false, "isDefaultBilling", errors);
      const isActive = parseBooleanCell(readCell(row, index, "isActive"), true, "isActive", errors);
      const countryRaw = readCell(row, index, "country");

      const result = customerAddressImportRowSchema.safeParse({
        customerCode: readCell(row, index, "customerCode") ?? "",
        label: readCell(row, index, "label") ?? "",
        recipientName: readCell(row, index, "recipientName") ?? "",
        phone: readCell(row, index, "phone") || undefined,
        addressLine1: readCell(row, index, "addressLine1") ?? "",
        addressLine2: readCell(row, index, "addressLine2") || undefined,
        city: readCell(row, index, "city") ?? "",
        postalCode: readCell(row, index, "postalCode") || undefined,
        country: countryRaw || "MK",
        isDefaultDelivery,
        isDefaultBilling,
        isActive,
      });
      if (!result.success) {
        pushZodErrors(errors, result.error);
        return { errors, warnings: [] };
      }
      return { data: result.data, errors, warnings: [] };
    },

    keyOf: (data) => `customerCode=${data.customerCode},label=${data.label}`,

    async resolve(tx, _tenantId, data) {
      const errors: ImportRowError[] = [];
      const customer = await tx.customer.findFirst({ where: { code: data.customerCode } });
      if (!customer) {
        errors.push({
          field: "customerCode",
          code: "REFERENCE_NOT_FOUND",
          message: `No customer with code "${data.customerCode}" was found for this tenant.`,
        });
        return { refs: { customerId: undefined }, existing: null, errors };
      }
      const existing = await tx.customerAddress.findFirst({ where: { customerId: customer.id, label: data.label } });
      return { refs: { customerId: customer.id }, existing, errors };
    },

    diff(existing, data) {
      const updateData: CustomerAddressRow = { ...data };
      if (!isColumnPresent(index, "phone")) updateData.phone = existing.phone ?? undefined;
      if (!isColumnPresent(index, "addressLine2")) updateData.addressLine2 = existing.addressLine2 ?? undefined;
      if (!isColumnPresent(index, "postalCode")) updateData.postalCode = existing.postalCode ?? undefined;
      if (!isColumnPresent(index, "country")) updateData.country = existing.country;
      if (!isColumnPresent(index, "isDefaultDelivery")) updateData.isDefaultDelivery = existing.isDefaultDelivery;
      if (!isColumnPresent(index, "isDefaultBilling")) updateData.isDefaultBilling = existing.isDefaultBilling;
      if (!isColumnPresent(index, "isActive")) updateData.isActive = existing.isActive;

      const changedFields: string[] = [];
      if (existing.recipientName !== updateData.recipientName) changedFields.push("recipientName");
      if ((existing.phone ?? "") !== (updateData.phone ?? "")) changedFields.push("phone");
      if (existing.addressLine1 !== updateData.addressLine1) changedFields.push("addressLine1");
      if ((existing.addressLine2 ?? "") !== (updateData.addressLine2 ?? "")) changedFields.push("addressLine2");
      if (existing.city !== updateData.city) changedFields.push("city");
      if ((existing.postalCode ?? "") !== (updateData.postalCode ?? "")) changedFields.push("postalCode");
      if (existing.country !== updateData.country) changedFields.push("country");
      if (existing.isDefaultDelivery !== updateData.isDefaultDelivery) changedFields.push("isDefaultDelivery");
      if (existing.isDefaultBilling !== updateData.isDefaultBilling) changedFields.push("isDefaultBilling");
      if (existing.isActive !== updateData.isActive) changedFields.push("isActive");

      return { changed: changedFields.length > 0, changedFields, updateData };
    },

    async executeCreate(tx, tenantId, actorUserId, data, refs, reason) {
      const { customerId } = refs as { customerId?: string };
      const { customerCode, ...addressInput } = data;
      void customerCode; // not part of CustomerAddressInput - already consumed by resolve() above
      const created = await createCustomerAddressInTx(tx, tenantId, actorUserId, customerId as string, addressInput as CustomerAddressInput, reason);
      return { id: created.id };
    },

    async executeUpdate(tx, tenantId, actorUserId, existing, updateData, _refs, reason) {
      const { customerCode, ...addressInput } = updateData;
      void customerCode;
      const updated = await updateCustomerAddressInTx(tx, tenantId, actorUserId, existing.id, addressInput as CustomerAddressInput, reason);
      return { id: updated.id };
    },
  };
}
