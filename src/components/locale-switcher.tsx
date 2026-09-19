"use client";

import { useLocale, useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";
import { usePathname, useRouter } from "@/i18n/navigation";

// Demonstrates that the locale-switching architecture works end-to-end
// (Phase 0 requirement) - not a styled production component yet.
export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const otherLocales = routing.locales.filter((candidate) => candidate !== locale);

  return (
    <div className="flex gap-3 text-sm">
      {otherLocales.map((candidate) => (
        <button
          key={candidate}
          type="button"
          onClick={() => router.replace(pathname, { locale: candidate })}
          className="underline underline-offset-2"
        >
          {t("switchTo", { locale: candidate.toUpperCase() })}
        </button>
      ))}
    </div>
  );
}
