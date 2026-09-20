import { withTenantContext } from "@/lib/db/with-tenant";
import type { ScopedTransactionClient } from "@/lib/db/scoped-client";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";
import { computeOrderTotals, computeSubmittedOrderTotals, type OrderLineForTotals } from "@/lib/domain/orders/order-totals";
import { toCsv } from "./csv";

/**
 * Seller-side CSV export (Phase 1E, §3). Every function here:
 *  - runs inside withTenantContext, so it can only ever see/export this
 *    tenant's own rows (same Layer 2 + RLS enforcement as every other
 *    domain read in this codebase - no separate "export" code path that
 *    could accidentally skip tenant scoping);
 *  - caps the number of rows read (EXPORT_ROW_CAP) so a pilot tenant can
 *    never trigger an unbounded read into memory;
 *  - writes an audit entry for the export action in the SAME transaction
 *    as the read, per "audit the export action if appropriate" - an
 *    export is a read, not a mutation of tenant data, so it is recorded
 *    as its own lightweight entityType ("Export") rather than attached to
 *    any single Customer/Product/Order row;
 *  - never includes an internal auth field (passwordHash, session token,
 *    etc.) - none of the tables exported here carry one, but this is
 *    called out explicitly per the brief's "no secrets" requirement.
 */

export const EXPORT_ROW_CAP = 20_000;

export type ExportResult = { csv: string; rowCount: number; truncated: boolean };

async function auditExport(
  tx: ScopedTransactionClient,
  tenantId: string,
  actorUserId: string,
  exportType: string,
  rowCount: number
) {
  await writeAuditLogEntry(tx, {
    tenantId,
    actorUserId,
    actingContext: "TENANT",
    entityType: "Export",
    entityId: exportType,
    action: "CREATE",
    reason: `Exported ${rowCount} row(s) as CSV`,
  });
}

export async function exportCustomersCsv(tenantId: string, actorUserId: string): Promise<ExportResult> {
  return withTenantContext(tenantId, async (tx) => {
    const total = await tx.customer.count();
    const customers = await tx.customer.findMany({ orderBy: { name: "asc" }, take: EXPORT_ROW_CAP });

    const csv = toCsv(
      [
        "id",
        "name",
        "code",
        "taxId",
        "contactEmail",
        "contactPhone",
        "discountPercent",
        "creditLimit",
        "paymentTermsDays",
        "isActive",
        "createdAt",
      ],
      customers.map((c) => [
        c.id,
        c.name,
        c.code,
        c.taxId,
        c.contactEmail,
        c.contactPhone,
        c.discountPercent != null ? Number(c.discountPercent) : null,
        c.creditLimit != null ? Number(c.creditLimit) : null,
        c.paymentTermsDays,
        c.isActive,
        c.createdAt,
      ])
    );

    await auditExport(tx, tenantId, actorUserId, "customers", customers.length);
    return { csv, rowCount: customers.length, truncated: total > customers.length };
  });
}

export async function exportProductsCsv(tenantId: string, actorUserId: string): Promise<ExportResult> {
  return withTenantContext(tenantId, async (tx) => {
    const total = await tx.productUnit.count();
    const productUnits = await tx.productUnit.findMany({
      orderBy: [{ product: { nameEn: "asc" } }, { label: "asc" }],
      take: EXPORT_ROW_CAP,
      include: { product: { select: { nameEn: true, nameMk: true, sku: true, isActive: true } }, unitOfMeasure: { select: { code: true, labelEn: true } } },
    });

    const csv = toCsv(
      [
        "productUnitId",
        "productNameEn",
        "productNameMk",
        "productSku",
        "productUnitSku",
        "packagingLabel",
        "unitOfMeasureCode",
        "minOrderQty",
        "orderIncrement",
        "isDefault",
        "productUnitActive",
        "productActive",
      ],
      productUnits.map((pu) => [
        pu.id,
        pu.product.nameEn,
        pu.product.nameMk,
        pu.product.sku,
        pu.sku,
        pu.label,
        pu.unitOfMeasure.code,
        Number(pu.minOrderQty),
        Number(pu.orderIncrement),
        pu.isDefault,
        pu.isActive,
        pu.product.isActive,
      ])
    );

    await auditExport(tx, tenantId, actorUserId, "products", productUnits.length);
    return { csv, rowCount: productUnits.length, truncated: total > productUnits.length };
  });
}

export async function exportPriceListsCsv(tenantId: string, actorUserId: string): Promise<ExportResult> {
  return withTenantContext(tenantId, async (tx) => {
    const total = await tx.priceListItem.count();
    const items = await tx.priceListItem.findMany({
      orderBy: [{ priceList: { name: "asc" } }],
      take: EXPORT_ROW_CAP,
      include: {
        priceList: { select: { name: true, code: true, currency: true, isActive: true } },
        productUnit: { select: { sku: true, label: true, product: { select: { nameEn: true, sku: true } } } },
      },
    });

    const csv = toCsv(
      ["priceListName", "priceListCode", "currency", "priceListActive", "productNameEn", "productSku", "productUnitSku", "packagingLabel", "price"],
      items.map((item) => [
        item.priceList.name,
        item.priceList.code,
        item.priceList.currency,
        item.priceList.isActive,
        item.productUnit.product.nameEn,
        item.productUnit.product.sku,
        item.productUnit.sku,
        item.productUnit.label,
        Number(item.price),
      ])
    );

    await auditExport(tx, tenantId, actorUserId, "price-lists", items.length);
    return { csv, rowCount: items.length, truncated: total > items.length };
  });
}

function toLineInputs(lines: { requestedQty: unknown; confirmedQty: unknown; unitPriceAtOrderTime: unknown; discountPercentAtOrderTime: unknown; vatRateAtOrderTime: unknown }[]): OrderLineForTotals[] {
  return lines.map((line) => ({
    requestedQty: Number(line.requestedQty),
    confirmedQty: line.confirmedQty ? Number(line.confirmedQty) : null,
    unitPriceAtOrderTime: Number(line.unitPriceAtOrderTime),
    discountPercentAtOrderTime: line.discountPercentAtOrderTime ? Number(line.discountPercentAtOrderTime) : null,
    vatRateAtOrderTime: Number(line.vatRateAtOrderTime),
  }));
}

export async function exportOrdersCsv(tenantId: string, actorUserId: string): Promise<ExportResult> {
  return withTenantContext(tenantId, async (tx) => {
    const total = await tx.order.count();
    const orders = await tx.order.findMany({
      orderBy: { orderNumber: "asc" },
      take: EXPORT_ROW_CAP,
      include: { lines: true, customer: { select: { name: true } } },
    });

    const csv = toCsv(
      [
        "orderNumber",
        "customer",
        "status",
        "placedByName",
        "placedByRole",
        "submittedAt",
        "requestedDeliveryDate",
        "submittedTotal",
        "confirmedTotal",
        "deliveredAt",
        "cancelledBy",
        "cancelReason",
      ],
      orders.map((order) => {
        const lineInputs = toLineInputs(order.lines);
        const submittedTotal = computeSubmittedOrderTotals(lineInputs).total;
        const hasConfirmed = order.lines.some((line) => line.confirmedQty !== null);
        return [
          order.orderNumber,
          order.customer.name,
          order.status,
          order.placedByName,
          order.placedByRole,
          order.submittedAt,
          order.requestedDeliveryDate,
          submittedTotal,
          hasConfirmed ? computeOrderTotals(lineInputs).total : null,
          order.deliveredAt,
          order.cancelledBy,
          order.cancelReason,
        ];
      })
    );

    await auditExport(tx, tenantId, actorUserId, "orders", orders.length);
    return { csv, rowCount: orders.length, truncated: total > orders.length };
  });
}

export async function exportOrderLinesCsv(tenantId: string, actorUserId: string): Promise<ExportResult> {
  return withTenantContext(tenantId, async (tx) => {
    const total = await tx.orderLine.count();
    const lines = await tx.orderLine.findMany({
      orderBy: [{ order: { orderNumber: "asc" } }],
      take: EXPORT_ROW_CAP,
      include: { order: { select: { orderNumber: true, status: true, customer: { select: { name: true } } } } },
    });

    const csv = toCsv(
      [
        "orderNumber",
        "customer",
        "orderStatus",
        "productName",
        "productSku",
        "packagingLabel",
        "requestedQty",
        "confirmedQty",
        "deliveredQty",
        "unavailableReason",
        "unitPrice",
        "discountPercent",
        "vatRate",
      ],
      lines.map((line) => [
        line.order.orderNumber,
        line.order.customer.name,
        line.order.status,
        line.productNameSnapshot,
        line.productSkuSnapshot,
        line.unitLabelSnapshot,
        Number(line.requestedQty),
        line.confirmedQty != null ? Number(line.confirmedQty) : null,
        line.deliveredQty != null ? Number(line.deliveredQty) : null,
        line.unavailableReason,
        Number(line.unitPriceAtOrderTime),
        line.discountPercentAtOrderTime != null ? Number(line.discountPercentAtOrderTime) : null,
        Number(line.vatRateAtOrderTime),
      ])
    );

    await auditExport(tx, tenantId, actorUserId, "order-lines", lines.length);
    return { csv, rowCount: lines.length, truncated: total > lines.length };
  });
}
