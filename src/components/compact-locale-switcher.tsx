"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, LOCALE_LABELS, type AppLocale } from "@/i18n/routing";

/**
 * Compact two-button locale switcher (distinct from the existing
 * src/components/locale-switcher.tsx used on the home page, which only
 * lists the OTHER locale as a "Switch to X" link - left untouched since
 * that page isn't in scope here). Always lists every locale from
 * routing.locales - adding a future locale needs no change to this file,
 * only routing.ts's `locales` array and `LOCALE_LABELS` map.
 *
 * Preserves the current path AND query string (e.g. ?error=1) across the
 * switch - usePathname()/useRouter() here are next-intl's locale-aware
 * wrappers (src/i18n/navigation.ts), same router.replace(path, { locale })
 * call the existing LocaleSwitcher already uses; useSearchParams() is the
 * plain next/navigation hook, since the query string itself is locale-
 * independent.
 */
export function CompactLocaleSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("locale");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function switchTo(target: AppLocale) {
    const query = searchParams.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { locale: target });
  }

  return (
    <div
      role="group"
      aria-label={t("switcherLabel")}
      className={`flex items-center gap-0.5 rounded-control border border-border bg-muted p-0.5 ${className}`}
    >
      {routing.locales.map((candidate) => {
        const isActive = candidate === locale;
        return (
          <button
            key={candidate}
            type="button"
            onClick={() => switchTo(candidate)}
            aria-current={isActive ? "true" : undefined}
            aria-label={isActive ? undefined : t("switchTo", { locale: LOCALE_LABELS[candidate] })}
            className={
              "rounded-control px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
              (isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-surface hover:text-foreground")
            }
          >
            {LOCALE_LABELS[candidate]}
          </button>
        );
      })}
    </div>
  );
}
