import { defineRouting } from "next-intl/routing";

// Macedonian first: it's the primary market (see docs/PRODUCT_REQUIREMENTS.md
// §5, "Localization"). English is the second supported locale. Phase 0 only
// needs to prove the routing/switching architecture works end-to-end, not a
// fully translated app - see messages/*.json for what's actually translated
// so far.
export const routing = defineRouting({
  locales: ["mk", "en"],
  defaultLocale: "mk",
});

export type AppLocale = (typeof routing.locales)[number];

// Single source of truth for a locale's short display label (used by
// src/components/compact-locale-switcher.tsx). Record<AppLocale, string>
// means TypeScript itself enforces a label for every locale added to
// `routing.locales` above - adding a future locale only ever touches this
// one file.
export const LOCALE_LABELS: Record<AppLocale, string> = {
  mk: "МК",
  en: "EN",
};
