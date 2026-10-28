import { Card } from "./card";

/**
 * A single label+value metric tile - replaces the ad hoc zinc-bordered
 * div every dashboard-style screen was repeating, built on the shared
 * Card primitive so it tracks the same tokens/dark-mode behavior.
 */
export function StatTile({
  label,
  value,
  accentBorder = false,
}: {
  label: string;
  value: number | string;
  accentBorder?: boolean;
}) {
  return (
    <Card className="p-4" accentBorder={accentBorder}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </Card>
  );
}
