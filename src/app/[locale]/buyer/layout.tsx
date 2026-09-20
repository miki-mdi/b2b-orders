import { getTranslations } from "next-intl/server";
import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { Link } from "@/i18n/navigation";
import { CartBadge } from "@/components/buyer/cart-badge";

export default async function BuyerLayout({ children }: { children: React.ReactNode }) {
  // Redirects away if this isn't an active buyer (CUSTOMER) session - see
  // src/lib/auth/require-buyer.ts. Every page under this layout can
  // therefore assume a valid tenantId/customerId is available without
  // re-checking, and a seller-admin session is never shown these routes.
  await requireBuyerSession();
  const t = await getTranslations("buyer.nav");

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <nav
        aria-label={t("title")}
        className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-zinc-200 p-3 md:w-56 md:flex-col md:border-b-0 md:border-r dark:border-zinc-800"
      >
        <p className="hidden px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 md:block">{t("title")}</p>
        <Link href="/buyer/catalog" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
          {t("catalog")}
        </Link>
        <Link href="/buyer/cart" className="flex items-center rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
          {t("cart")}
          <CartBadge />
        </Link>
        <Link href="/buyer/orders" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
          {t("orders")}
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
