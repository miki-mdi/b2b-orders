import { getTranslations } from "next-intl/server";
import { requirePlatformAdminSession } from "@/lib/auth/require-platform-admin";
import { Link } from "@/i18n/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Redirects away if this isn't a platform-admin session - see
  // src/lib/auth/require-platform-admin.ts. Mirrors seller/layout.tsx and
  // buyer/layout.tsx: every page under this layout can assume the guard
  // already ran.
  await requirePlatformAdminSession();
  const t = await getTranslations("admin.nav");

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <nav
        aria-label={t("title")}
        className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-zinc-200 p-3 md:w-56 md:flex-col md:border-b-0 md:border-r dark:border-zinc-800"
      >
        <p className="hidden px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 md:block">{t("title")}</p>
        <Link href="/admin/diagnostics" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
          {t("diagnostics")}
        </Link>
        <Link href="/" className="rounded px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 md:mt-auto dark:hover:bg-zinc-800">
          {t("backToSite")}
        </Link>
      </nav>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
