import { requireSellerSession } from "@/lib/auth/require-seller";
import { exportOrdersCsv } from "@/lib/domain/export/export-service";
import { csvResponseHeaders } from "@/lib/domain/export/csv-response";

export async function GET() {
  const session = await requireSellerSession();
  const { csv, truncated } = await exportOrdersCsv(session.tenantId, session.userId);
  return new Response(csv, { headers: csvResponseHeaders("orders.csv", truncated) });
}
