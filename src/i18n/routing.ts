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
