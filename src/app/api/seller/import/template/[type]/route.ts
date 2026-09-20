import { requireSellerSession } from "@/lib/auth/require-seller";
import { toCsv } from "@/lib/domain/export/csv";
import { csvResponseHeaders } from "@/lib/domain/export/csv-response";
import { IMPORT_TEMPLATES } from "@/lib/domain/import/templates";
import { IMPORT_TYPES, type ImportType } from "@/lib/domain/import/types";

function isImportType(value: string): value is ImportType {
  return (IMPORT_TYPES as readonly string[]).includes(value);
}

export async function GET(_request: Request, { params }: { params: Promise<{ type: string }> }) {
  // Guard only, same as every other seller route - see /seller/exports/page.tsx's own comment.
  await requireSellerSession();
  const { type } = await params;

  if (!isImportType(type)) {
    return new Response("Not found", { status: 404 });
  }

  const template = IMPORT_TEMPLATES[type];
  const csv = toCsv(template.headers, [template.sampleRow]);
  return new Response(csv, { headers: csvResponseHeaders(`${type}-template.csv`, false) });
}
