import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireApiCapability } from "@/lib/auth/permissions";
import { exportPriceListsCsv } from "@/lib/domain/export/export-service";
import { csvResponseHeaders } from "@/lib/domain/export/csv-response";

export async function GET() {
  const session = await requireSellerSession();
  const denied = requireApiCapability(session, "exports:read");
  if (denied) return denied;
  const { csv, truncated } = await exportPriceListsCsv(session.tenantId, session.userId);
  return new Response(csv, { headers: csvResponseHeaders("price-lists.csv", truncated) });
}
