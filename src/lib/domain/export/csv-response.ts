/** Shared response headers for every /api/seller/export/* route (Phase 1E, §3/§9). */
export function csvResponseHeaders(filename: string, truncated: boolean): HeadersInit {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    // Surfaces EXPORT_ROW_CAP truncation (export-service.ts) to the client
    // without needing to parse the CSV body - a seller/tooling integration
    // can detect "this wasn't the full dataset" from the response alone.
    "X-Export-Truncated": String(truncated),
  };
}
