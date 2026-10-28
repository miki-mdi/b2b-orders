import type { ReactNode } from "react";

/**
 * Title + optional subtitle + optional trailing action, the exact
 * "h1 + button top-right" shape every seller/buyer list page already
 * repeats inline (see Phase 1 redesign plan) - first real extraction of
 * it into a shared primitive, starting with the seller dashboard.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
