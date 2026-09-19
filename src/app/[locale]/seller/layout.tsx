import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { Link } from "@/i18n/navigation";

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  // Redirects away if this isn't an active seller (TENANT) session - see
  // src/lib/auth/require-seller.ts. Every page under this layout can
  // therefore assume a valid tenantId is available without re-checking.
  await requireSellerSession();
  const t = await getTranslations("seller.nav");

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
        <Link href="/seller/categories" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
          {t("categories")}
        </Link>
        <Link href="/seller/units" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
          {t("units")}
        </Link>
        <Link href="/seller/products" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
          {t("products")}
        </Link>
        <Link
          href="/"
          className="rounded px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 md:mt-auto dark:hover:bg-zinc-800"
        >
          {t("backToSite")}
        </Link>
      </nav>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
