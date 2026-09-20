import type { ImportType } from "./types";

/**
 * The stable header definition for every importable entity (Phase 1F-A,
 * §3/§4) - shared by the template-download route AND each
 * <entity>-import.ts's normalizeRow, so "what a template looks like" and
 * "what a column name means" can never drift apart. Headers are English,
 * machine-readable, and never localized (a seller's saved import mapping
 * must not break if they change their UI locale) - Macedonian text is fully
 * supported as CELL VALUES (nameMk, labelMk, etc.), just not as header names.
 *
 * `key` documents which column(s) this plan's import uses as its business
 * key (requirement #4) - informational here; each <entity>-import.ts's
 * planRow is the actual enforcement.
 */
export type ImportTemplate = {
  headers: string[];
  key: string[];
  /** One example data row, same length/order as `headers`, for the downloadable template. */
  sampleRow: string[];
};

export const IMPORT_TEMPLATES: Record<ImportType, ImportTemplate> = {
  categories: {
    headers: ["code", "nameMk", "nameEn", "description", "sortOrder", "isActive"],
    key: ["code"],
    sampleRow: ["BEVERAGES", "Пијалоци", "Beverages", "", "0", "true"],
  },
  units: {
    headers: ["code", "labelMk", "labelEn", "isActive"],
    key: ["code"],
    sampleRow: ["box", "кутија", "Box", "true"],
  },
  products: {
    headers: ["sku", "nameMk", "nameEn", "categoryCode", "description", "barcode", "defaultVatRate", "isActive"],
    key: ["sku"],
    sampleRow: ["PROD-001", "Пример производ", "Sample Product", "BEVERAGES", "", "", "18", "true"],
  },
  "product-units": {
    headers: [
      "sku",
      "productSku",
      "unitOfMeasureCode",
      "label",
      "barcode",
      "conversionFactorToBase",
      "minOrderQty",
      "orderIncrement",
      "isDefault",
      "isActive",
    ],
    key: ["sku"],
    sampleRow: ["PROD-001-BOX12", "PROD-001", "box", "Box of 12", "", "12", "1", "1", "true", "true"],
  },
  customers: {
    headers: [
      "code",
      "name",
      "taxId",
      "contactEmail",
      "contactPhone",
      "notes",
      "discountPercent",
      "creditLimit",
      "paymentTermsDays",
      "isActive",
    ],
    key: ["code"],
    sampleRow: ["CUST-0001", "Пример Клиент ДОО", "MK1234567", "buyer@example.com", "", "", "5", "", "30", "true"],
  },
  "customer-addresses": {
    headers: [
      "customerCode",
      "label",
      "recipientName",
      "phone",
      "addressLine1",
      "addressLine2",
      "city",
      "postalCode",
      "country",
      "isDefaultDelivery",
      "isDefaultBilling",
      "isActive",
    ],
    key: ["customerCode", "label"],
    sampleRow: ["CUST-0001", "Main warehouse", "Contact Person", "", "Street 1", "", "Skopje", "1000", "MK", "true", "true", "true"],
  },
  "price-lists": {
    headers: ["code", "name", "description", "currency", "isDefault", "isActive"],
    key: ["code"],
    sampleRow: ["STD", "Standard price list", "", "MKD", "true", "true"],
  },
  "price-list-items": {
    headers: ["priceListCode", "productUnitSku", "price"],
    key: ["priceListCode", "productUnitSku"],
    sampleRow: ["STD", "PROD-001-BOX12", "1200"],
  },
};
