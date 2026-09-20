import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { hasCapability } from "@/lib/auth/permissions";
import { Link } from "@/i18n/navigation";

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  // Redirects away if this isn't an active seller (TENANT) session - see
  // src/lib/auth/require-seller.ts. Every page under this layout can
  // therefore assume a valid tenantId is available without re-checking.
  const session = await requireSellerSession();
  const t = await getTranslations("seller.nav");

  // Cosmetic only (Phase 1F-B1) - each linked page enforces its own
  // capability server-side (src/lib/auth/permissions.ts); hiding a link here
  // never substitutes for that. Every role has some order-read capability,
  // so Orders is never hidden.
  const showCategories = hasCapability(session.role, "catalog:read");
  const showUnits = hasCapability(session.role, "catalog:read");
  const showProducts = hasCapability(session.role, "catalog:read");
  const showCustomers = hasCapability(session.role, "customers:read");
  const showPriceLists = hasCapability(session.role, "pricing:read");
  const showAudit = hasCapability(session.role, "audit:read");
  const showImports = hasCapability(session.role, "imports:manage");
  const showExports = hasCapability(session.role, "exports:read");

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <nav
        aria-label={t("title")}
        className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-zinc-200 p-3 md:w-56 md:flex-col md:border-b-0 md:border-r dark:border-zinc-800"
      >
        <p className="hidden px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 md:block">{t("title")}</p>
        <Link href="/seller" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
          {t("dashboard")}
        </Link>
        {showCategories && (
          <Link href="/seller/categories" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {t("categories")}
          </Link>
        )}
        {showUnits && (
          <Link href="/seller/units" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {t("units")}
          </Link>
        )}
        {showProducts && (
          <Link href="/seller/products" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {t("products")}
          </Link>
        )}
        {showCustomers && (
          <Link href="/seller/customers" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {t("customers")}
          </Link>
        )}
        {showPriceLists && (
          <Link href="/seller/price-lists" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {t("priceLists")}
          </Link>
        )}
        <Link href="/seller/orders" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
          {t("orders")}
        </Link>
        {showAudit && (
          <Link href="/seller/audit" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {t("audit")}
          </Link>
        )}
        {showImports && (
          <Link href="/seller/imports" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {t("imports")}
          </Link>
        )}
        {showExports && (
          <Link href="/seller/exports" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {t("exports")}
          </Link>
        )}
        <Link
          href="/"
          className="rounded px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 md:mt-auto dark:hover:bg-zinc-800"
        >
          {t("backToSite")}
        </Link>
      </nav>
      {/*
        min-w-0 overrides the flex item default of min-width: auto (which
        resolves to the item's min-content size). Without it, a wide child
        - e.g. the Imports wizard's min-w-[640px] results table - forces
        `main` wider than the space `md:flex-row` actually gives it once the
        sidebar takes its 224px, pushing the whole row layout past the
        viewport instead of letting the table's own overflow-x-auto scroll
        internally. Found via manual review after a reported visual overlap
        at 768px (Phase 1F-A) - confirmed via computed layout that
        scrollWidth > clientWidth only at this breakpoint, not at mobile
        (flex-col, width is the cross axis, unaffected) or desktop (enough
        room that the table's min-width never has to be forced).
      */}
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
