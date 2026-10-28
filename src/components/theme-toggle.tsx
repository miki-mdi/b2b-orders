"use client";

import { useEffect, useSyncExternalStore, type SVGProps } from "react";
import { useTranslations } from "next-intl";

const STORAGE_KEY = "b2b-orders-theme";

type Theme = "light" | "dark";

function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function resolveEffectiveTheme(): Theme {
  const stored = readStoredTheme();
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * A tiny external store over localStorage + the OS's prefers-color-scheme
 * media query, read through React's useSyncExternalStore rather than
 * useState+useEffect - this project's lint config
 * (react-hooks/set-state-in-effect) flags a naive "read on mount" effect
 * as an avoidable synchronous setState-in-an-effect, and
 * src/lib/cart/cart-store.ts already establishes exactly this
 * module-level-store pattern for the same reason. getServerSnapshot
 * returns "light" (the pre-data-theme default globals.css itself renders),
 * so React shows that during hydration and corrects to the real resolved
 * theme immediately after - no mismatch warning, same settle-after-mount
 * behavior as the cart's own hydration flag.
 */
const listeners = new Set<() => void>();
let cachedTheme: Theme = typeof window === "undefined" ? "light" : resolveEffectiveTheme();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMediaChange = () => {
    // Only the OS's own change should move the needle when the user has
    // never made an explicit choice - a manual choice always wins.
    if (!readStoredTheme()) {
      cachedTheme = resolveEffectiveTheme();
      emit();
    }
  };
  media.addEventListener("change", onMediaChange);

  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onMediaChange);
  };
}

function getSnapshot(): Theme {
  return cachedTheme;
}

function getServerSnapshot(): Theme {
  return "light";
}

function setTheme(next: Theme) {
  cachedTheme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage unavailable (private browsing, disabled) - the toggle still
    // works for this page view via the data-theme attribute below, it
    // just won't survive a refresh. Nothing to recover from here.
  }
  document.documentElement.setAttribute("data-theme", next);
  emit();
}

function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4" y1="12" x2="2" y2="12" />
      <line x1="22" y1="12" x2="20" y2="12" />
      <line x1="5" y1="5" x2="6.5" y2="6.5" />
      <line x1="17.5" y1="17.5" x2="19" y2="19" />
      <line x1="5" y1="19" x2="6.5" y2="17.5" />
      <line x1="17.5" y1="6.5" x2="19" y2="5" />
    </svg>
  );
}

/** Solid crescent, single filled path - no stroke, no star, no face. */
function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M9.37 5.51A7.49 7.49 0 0 0 18.49 14.63 7.5 7.5 0 1 1 9.37 5.51Z"
        fill="currentColor"
      />
    </svg>
  );
}

const SEGMENT_BASE =
  "flex items-center justify-center rounded-control p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const SEGMENT_ACTIVE = "bg-primary text-primary-foreground shadow-sm";
const SEGMENT_INACTIVE = "text-muted-foreground hover:bg-surface hover:text-foreground";

/**
 * Icon-only two-segment control, styled identically to
 * CompactLocaleSwitcher (same rounded-control border bg-muted p-0.5
 * shell, same bg-primary/shadow-sm active segment, same inactive/hover
 * classes) so the two controls read as one family beside each other.
 * Each segment has a static, state-independent aria-label (the mode
 * name) since there's no visible text to fall back on - aria-current
 * marks the selected one, mirroring how the locale switcher's visible
 * MK/EN text plus aria-current works. Default (no stored choice) follows
 * the OS via globals.css's plain @media (prefers-color-scheme) rule;
 * this component only ever writes a value once the user explicitly
 * clicks a segment. Storage key/values match
 * src/app/[locale]/layout.tsx's THEME_INIT_SCRIPT exactly.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const t = useTranslations("theme");
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isDark = theme === "dark";

  // Synchronizes the DOM attribute with React's resolved theme on every
  // mount/update - a DOM side effect, not a setState call, so this doesn't
  // trip react-hooks/set-state-in-effect. Needed because a next-intl
  // locale switch (router.replace across the [locale] segment) can
  // recreate the <html> element, which drops any attribute set
  // imperatively outside React - without this, a manual theme choice
  // would silently revert to system preference right after switching
  // locale. When there's no stored choice, readStoredTheme() is null and
  // this is a no-op, correctly leaving data-theme absent for the plain
  // @media (prefers-color-scheme) rule to keep handling it.
  useEffect(() => {
    if (readStoredTheme()) {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  return (
    <div
      role="group"
      aria-label={t("groupLabel")}
      className={`flex items-center gap-0.5 rounded-control border border-border bg-muted p-0.5 ${className}`}
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-current={!isDark ? "true" : undefined}
        aria-label={t("light")}
        className={`${SEGMENT_BASE} ${!isDark ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
      >
        <SunIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-current={isDark ? "true" : undefined}
        aria-label={t("dark")}
        className={`${SEGMENT_BASE} ${isDark ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
      >
        <MoonIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
