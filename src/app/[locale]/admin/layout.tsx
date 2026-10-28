import { getTranslations } from "next-intl/server";
import { requirePlatformAdminSession } from "@/lib/auth/require-platform-admin";
import { Link } from "@/i18n/navigation";
import { LanguageThemeControls } from "@/components/language-theme-controls";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Redirects away if this isn't a platform-admin session - see
  // src/lib/auth/require-platform-admin.ts. Mirrors seller/layout.tsx and
  // buyer/layout.tsx: every page under this layout can assume the guard
  // already ran.
  await requirePlatformAdminSession();
  const t = await getTranslations("admin.nav");
  // "home" namespace deliberately reused - see seller/layout.tsx's identical comment.
  const tHome = await getTranslations("home");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Same minimal thin-strip approach as buyer/layout.tsx - this layout
          has no top app-bar and no collapsible mobile menu to place
          controls inside. */}
      <div className="flex items-center justify-end gap-3 border-b border-zinc-200 p-2 dark:border-zinc-800">
        <SignOutButton label={tHome("signOut")} />
        <LanguageThemeControls />
      </div>
      <div className="flex flex-1 flex-col md:flex-row">
        <nav
          aria-label={t("title")}
          className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-zinc-200 p-3 md:w-56 md:flex-col md:border-b-0 md:border-r dark:border-zinc-800"
        >
          <p className="hidden px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 md:block">{t("title")}</p>
          <Link href="/admin/tenants" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {t("tenants")}
          </Link>
          <Link href="/admin/users" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {t("users")}
          </Link>
          <Link href="/admin/diagnostics" className="rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {t("diagnostics")}
          </Link>
          <Link href="/" className="rounded px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 md:mt-auto dark:hover:bg-zinc-800">
            {t("backToSite")}
          </Link>
        </nav>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
