/** Minimal CSV builder for test fixtures - parseCsv (the real, hardened parser) handles the reading side; this just needs to produce something it can read. */
export function csv(headers: string[], rows: (string | number | boolean)[][]): string {
  const esc = (v: string | number | boolean) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n") + "\n";
}
