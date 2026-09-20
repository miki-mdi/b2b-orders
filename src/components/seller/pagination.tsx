import { Link } from "@/i18n/navigation";

/**
 * Server-rendered pagination controls, shared across every seller list
 * screen that paginates (orders, customers, products, audit log - Phase
 * 1E, §8). `buildHref` lets each page keep its own other query params
 * (status/search filters, etc.) while only the `page` value changes.
 */
export function Pagination({
  page,
  totalPages,
  buildHref,
  previousLabel,
  nextLabel,
  summaryLabel,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
  previousLabel: string;
  nextLabel: string;
  /** e.g. "Page {page} of {totalPages} ({total} total)" already interpolated by the caller. */
  summaryLabel: string;
}) {
  if (totalPages <= 1) return null;

  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      {hasPrevious ? (
        <Link href={buildHref(page - 1)} className="rounded border border-zinc-300 px-3 py-1.5 underline-offset-2 hover:underline dark:border-zinc-700">
          {previousLabel}
        </Link>
      ) : (
        <span className="rounded border border-zinc-200 px-3 py-1.5 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">{previousLabel}</span>
      )}

      <span className="text-zinc-500 dark:text-zinc-400">{summaryLabel}</span>

      {hasNext ? (
        <Link href={buildHref(page + 1)} className="rounded border border-zinc-300 px-3 py-1.5 underline-offset-2 hover:underline dark:border-zinc-700">
          {nextLabel}
        </Link>
      ) : (
        <span className="rounded border border-zinc-200 px-3 py-1.5 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">{nextLabel}</span>
      )}
    </nav>
  );
}
