import { requireSellerSession } from "@/lib/auth/require-seller";
import { exportOrderLinesCsv } from "@/lib/domain/export/export-service";
import { csvResponseHeaders } from "@/lib/domain/export/csv-response";

export async function GET() {
  const session = await requireSellerSession();
  const { csv, truncated } = await exportOrderLinesCsv(session.tenantId, session.userId);
  return new Response(csv, { headers: csvResponseHeaders("order-lines.csv", truncated) });
}
