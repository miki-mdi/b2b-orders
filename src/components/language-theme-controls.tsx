"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { CompactLocaleSwitcher } from "@/components/compact-locale-switcher";

/**
 * Thin composition only - no new state, no new storage, no duplicate
 * preference logic. ThemeToggle and CompactLocaleSwitcher each already own
 * their complete behavior (persistence, system-preference fallback,
 * query-string-preserving locale switch, accessibility labels); this just
 * places the two existing segmented controls beside each other with a
 * consistent gap so every call site (seller header, sign-in, home) gets
 * the same pairing instead of repeating the wrapper div.
 */
export function LanguageThemeControls({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <ThemeToggle />
      <CompactLocaleSwitcher />
    </div>
  );
}
