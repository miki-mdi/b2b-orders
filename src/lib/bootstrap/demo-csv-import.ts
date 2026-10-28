/**
 * CSV-file preflight + import orchestration for the local demo dataset
 * (demo-data/local-only/<slug>/*.csv) - used by prisma/restore-local-demo.ts.
 *
 * Never a raw Prisma write: importAllDemoCsvFiles goes through exactly the
 * same tenant-scoped, RLS-safe, audited confirmImport domain service
 * (src/lib/domain/import/import-service.ts) the seller UI's Imports wizard
 * uses - the only difference is the file comes from disk instead of an
 * HTTP upload.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv } from "@/lib/domain/import/csv-parser";
import { confirmImport } from "@/lib/domain/import/import-service";
import { IMPORT_TEMPLATES } from "@/lib/domain/import/templates";
import { IMPORT_TYPES, type ImportType } from "@/lib/domain/import/types";
import { prismaBase } from "@/lib/db/prisma";
import { DEMO_TENANTS } from "@/lib/bootstrap/demo-data";

export class DemoCsvPreflightError extends Error {}

const DEMO_DATA_ROOT = path.resolve(process.cwd(), "demo-data", "local-only");

export function demoCsvPath(tenantSlug: string, importType: ImportType): string {
  return path.join(DEMO_DATA_ROOT, tenantSlug, `${importType}.csv`);
}

/**
 * Pure check: does this header row exactly match (same columns, same
 * order) the stable template for this import type (templates.ts - the
 * single source of truth shared with the seller UI's template download and
 * every <entity>-import.ts's normalizeRow)? Throws with both the expected
 * and found header lists on mismatch, never silently proceeds.
 */
export function validateCsvHeaders(importType: ImportType, actualHeaders: string[], fileLabel: string): void {
  const expected = IMPORT_TEMPLATES[importType].headers;
  const matches = actualHeaders.length === expected.length && actualHeaders.every((h, i) => h === expected[i]);
  if (!matches) {
    throw new DemoCsvPreflightError(
      `${fileLabel}: header row does not match the expected "${importType}" template.\n` +
        `  expected: ${expected.join(",")}\n` +
        `  found:    ${actualHeaders.join(",")}`
    );
  }
}

/**
 * Checks every one of the 48 expected demo CSV files (6 tenants x 8 import
 * types) exists on disk and has a header row matching templates.ts -
 * before any database read or write, including before any account
 * reconciliation. Stops immediately on the first missing file or header
 * mismatch.
 */
export async function preflightDemoCsvFiles(): Promise<void> {
  for (const tenant of DEMO_TENANTS) {
    for (const importType of IMPORT_TYPES) {
      const filePath = demoCsvPath(tenant.slug, importType);
      let text: string;
      try {
        text = await readFile(filePath, "utf8");
      } catch {
        throw new DemoCsvPreflightError(`Missing demo CSV file: ${filePath}`);
      }
      const { headers } = parseCsv(text);
      validateCsvHeaders(importType, headers, filePath);
    }
  }
}

/**
 * Imports all 48 demo CSV files for all six tenants, in dependency order
 * (categories -> units -> products -> product-units -> customers ->
 * customer-addresses -> price-lists -> price-list-items), through
 * confirmImport - the same atomic-per-file, audited write path the seller
 * UI uses. Each tenant's own Seller Admin is used as the importing actor.
 * Stops immediately if any row is rejected, or if the expected tenant/
 * Seller Admin isn't found (account reconciliation should always run
 * first) - never continues past a partially-imported file.
 */
export async function importAllDemoCsvFiles(): Promise<void> {
  for (const tenant of DEMO_TENANTS) {
    const tenantRow = await prismaBase.tenant.findUnique({ where: { slug: tenant.slug } });
    if (!tenantRow) {
      throw new DemoCsvPreflightError(
        `"${tenant.slug}": tenant not found. Account reconciliation should have created it before CSV import runs.`
      );
    }
    const sellerAdmin = await prismaBase.user.findUnique({ where: { email: tenant.adminEmail } });
    if (!sellerAdmin) {
      throw new DemoCsvPreflightError(
        `"${tenant.slug}": Seller Admin "${tenant.adminEmail}" not found. Account reconciliation should have ` +
          "created it before CSV import runs."
      );
    }

    console.log(`  ${tenant.slug}:`);
    for (const importType of IMPORT_TYPES) {
      const filePath = demoCsvPath(tenant.slug, importType);
      const text = await readFile(filePath, "utf8");
      const result = await confirmImport(importType, tenantRow.id, sellerAdmin.id, text, path.basename(filePath));
      console.log(
        `    ${importType}: ${result.summary.created} created, ${result.summary.updated} updated, ` +
          `${result.summary.unchanged} unchanged, ${result.summary.rejected} rejected.`
      );
      if (result.summary.rejected > 0) {
        const rejectedRows = result.rows.filter((r) => r.status === "ERROR");
        const detail = rejectedRows.map((r) => `row ${r.row}: ${r.errors.map((e) => e.message).join("; ")}`).join("\n    ");
        throw new DemoCsvPreflightError(
          `${filePath}: ${result.summary.rejected} row(s) were rejected - refusing to continue with a ` +
            `partially-imported dataset.\n    ${detail}`
        );
      }
    }
  }
}
