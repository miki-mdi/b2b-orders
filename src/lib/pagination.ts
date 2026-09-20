/**
 * Shared server-side pagination + input-size limits (Phase 1E, §8/§9).
 * Every seller list screen that can grow unbounded with real tenant data
 * (orders, customers, products, the audit log) clamps through these same
 * helpers, so "what's a reasonable page size" and "how long can a search
 * term be" are answered once, not per screen.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_SEARCH_TERM_LENGTH = 200;

export function clampPage(page: number | string | undefined): number {
  const parsed = typeof page === "string" ? Number(page) : page;
  if (!parsed || !Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

export function clampPageSize(pageSize: number | string | undefined, defaultSize = DEFAULT_PAGE_SIZE): number {
  const parsed = typeof pageSize === "string" ? Number(pageSize) : pageSize;
  if (!parsed || !Number.isFinite(parsed) || parsed < 1) return defaultSize;
  return Math.min(Math.floor(parsed), MAX_PAGE_SIZE);
}

/** Trims and caps a free-text search term - never trusts an unbounded query string length. */
export function clampSearchTerm(term: string | undefined): string | undefined {
  const trimmed = term?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_SEARCH_TERM_LENGTH);
}

export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function toPageResult<T>(items: T[], total: number, page: number, pageSize: number): PageResult<T> {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
