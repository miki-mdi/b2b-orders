import { randomUUID } from "node:crypto";
import { withTenantContext } from "@/lib/db/with-tenant";
import { writeAuditLogEntry } from "@/lib/domain/audit/audit-log";
import { toCsv } from "@/lib/domain/export/csv";
import { parseCsv } from "./csv-parser";
import { planAndExecuteRows, type EntityImportOps } from "./driver";
import { assertRowCount, IMPORT_CONFIRM_TRANSACTION_TIMEOUT_MS, IMPORT_PREVIEW_TRANSACTION_TIMEOUT_MS } from "./security";
import { createCategoryImportOps } from "./categories-import";
import { createUnitImportOps } from "./units-import";
import { createProductImportOps } from "./products-import";
import { createProductUnitImportOps } from "./product-units-import";
import { createCustomerImportOps } from "./customers-import";
import { createCustomerAddressImportOps } from "./customer-addresses-import";
import { createPriceListImportOps } from "./price-lists-import";
import { createPriceListItemImportOps } from "./price-list-items-import";
import type { ImportConfirmResult, ImportPreviewResult, ImportRowPlan, ImportType } from "./types";

export class UnknownImportTypeError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpsFactory = (headers: string[]) => EntityImportOps<any, any>;

const OPS_FACTORIES: Record<ImportType, OpsFactory> = {
  categories: createCategoryImportOps,
  units: createUnitImportOps,
  products: createProductImportOps,
  "product-units": createProductUnitImportOps,
  customers: createCustomerImportOps,
  "customer-addresses": createCustomerAddressImportOps,
  "price-lists": createPriceListImportOps,
  "price-list-items": createPriceListItemImportOps,
};

function resolveOps(importType: ImportType, headers: string[]) {
  const factory = OPS_FACTORIES[importType];
  if (!factory) {
    throw new UnknownImportTypeError(`Unknown import type: ${importType}`);
  }
  return factory(headers);
}

/**
 * Read-only pass: parses, validates, and plans every row against the
 * current database state, without writing anything (requirement #2/#8 -
 * "never write data during preview"). Runs inside its own withTenantContext
 * transaction purely so every lookup is the same tenant-scoped `tx` the
 * rest of the app uses (Layer 2 + RLS) - nothing in this transaction ever
 * calls an `...InTx` create/update function, so nothing is written, and
 * the transaction is simply left to commit-with-no-changes.
 *
 * Passes an explicit, longer-than-default transaction timeout
 * (IMPORT_PREVIEW_TRANSACTION_TIMEOUT_MS, security.ts) - at up to
 * MAX_IMPORT_ROWS rows, the per-row FK-reference resolution this does can
 * exceed Prisma's 5s client default well within the supported row cap.
 */
export async function previewImport(
  importType: ImportType,
  tenantId: string,
  actorUserId: string,
  csvText: string
): Promise<ImportPreviewResult> {
  const parsed = parseCsv(csvText);
  assertRowCount(parsed.rows.length);
  const ops = resolveOps(importType, parsed.headers);

  const result = await withTenantContext(
    tenantId,
    (tx) => planAndExecuteRows(tx, tenantId, actorUserId, parsed, ops, "preview", ""),
    { timeout: IMPORT_PREVIEW_TRANSACTION_TIMEOUT_MS }
  );

  return {
    summary: {
      importType,
      totalRows: parsed.rows.length + parsed.malformedRows.length,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      rejected: result.rejected + parsed.malformedRows.length,
    },
    rows: result.rows,
    malformedRows: parsed.malformedRows,
  };
}

function toResultCsv(rows: ImportRowPlan[], malformedRows: { row: number; message: string }[]): string {
  const combined: { row: number; result: string; key: string; entityId: string; message: string }[] = [
    ...rows.map((r) => ({
      row: r.row,
      result: r.status,
      key: r.key,
      entityId: r.entityId ?? "",
      message: r.errors.map((e) => e.message).concat(r.warnings).join("; "),
    })),
    ...malformedRows.map((m) => ({ row: m.row, result: "ERROR", key: "", entityId: "", message: m.message })),
  ].sort((a, b) => a.row - b.row);

  return toCsv(
    ["row", "result", "key", "entityId", "message"],
    combined.map((r) => [r.row, r.result, r.key, r.entityId, r.message])
  );
}

/**
 * The only function that writes (requirement #2). Re-parses and re-plans
 * from scratch - exactly like previewImport - inside ONE withTenantContext
 * transaction that also performs every write, so the whole confirmed
 * import is atomic: either everything planned as CREATE/UPDATE lands, or an
 * unexpected failure rolls back the entire transaction and nothing is left
 * partially written (requirement #8). A row already planned as ERROR
 * (validation failure, duplicate key, unresolved reference) is simply
 * never attempted - that is a normal "rejected" outcome, not a failure that
 * aborts the batch. See driver.ts's header comment for that distinction.
 *
 * Passes an explicit, longer-than-default transaction timeout
 * (IMPORT_CONFIRM_TRANSACTION_TIMEOUT_MS, security.ts) - this transaction
 * does the same per-row reference resolution as preview PLUS the actual
 * writes and a per-row audit log entry, and at up to MAX_IMPORT_ROWS rows
 * that real work already exceeds Prisma's 5s client default on ordinary
 * hardware (discovered via tests/import/performance-sanity.test.ts during
 * Phase 1F-B2 closure) - not a bug in the import logic itself, just a
 * too-tight default for a deliberately single-transaction, up-to-5,000-row
 * write. See with-tenant.ts's TenantTransactionOptions doc comment for why
 * this is scoped to only this call site, not a global Prisma default change.
 */
export async function confirmImport(
  importType: ImportType,
  tenantId: string,
  actorUserId: string,
  csvText: string,
  fileName: string
): Promise<ImportConfirmResult> {
  const parsed = parseCsv(csvText);
  assertRowCount(parsed.rows.length);
  const ops = resolveOps(importType, parsed.headers);
  const batchId = randomUUID();
  const reason = `Imported via CSV batch ${batchId}`;

  const result = await withTenantContext(
    tenantId,
    async (tx) => {
      const planResult = await planAndExecuteRows(tx, tenantId, actorUserId, parsed, ops, "confirm", reason);

      await writeAuditLogEntry(tx, {
        tenantId,
        actorUserId,
        actingContext: "TENANT",
        entityType: "Import",
        entityId: `${importType}:${batchId}`,
        action: "CREATE",
        newValue: {
          batchId,
          fileName,
          created: planResult.created,
          updated: planResult.updated,
          unchanged: planResult.unchanged,
          rejected: planResult.rejected + parsed.malformedRows.length,
        },
        reason: `Imported ${fileName}: ${planResult.created} created, ${planResult.updated} updated, ${planResult.unchanged} unchanged, ${planResult.rejected + parsed.malformedRows.length} rejected`,
      });

      return planResult;
    },
    { timeout: IMPORT_CONFIRM_TRANSACTION_TIMEOUT_MS }
  );

  const summary = {
    batchId,
    importType,
    fileName,
    totalRows: parsed.rows.length + parsed.malformedRows.length,
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    rejected: result.rejected + parsed.malformedRows.length,
  };

  return {
    summary,
    rows: result.rows,
    malformedRows: parsed.malformedRows,
    resultCsv: toResultCsv(result.rows, parsed.malformedRows),
  };
}
