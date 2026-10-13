"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * No existing icon library or inline-SVG convention found anywhere in src/
 * (checked before writing this) - hand-written eye / crossed-eye outline,
 * no new dependency. Purely decorative (aria-hidden) - the button itself
 * carries the accessible name via aria-label.
 */
function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed ? <line x1="3" y1="3" x2="21" y2="21" /> : null}
    </svg>
  );
}

/**
 * Plain client-side show/hide toggle - no form state, no validation change.
 * The input keeps name="password"/required exactly as before; only its
 * `type` attribute (and the toggle icon/aria-label) changes.
 */
export function PasswordField() {
  const t = useTranslations("signIn");
  const [visible, setVisible] = useState(false);

  return (
    <label className="flex flex-col gap-1 text-sm">
      {t("password")}
      <span className="relative">
        <input
          name="password"
          type={visible ? "text" : "password"}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 pr-9 dark:border-zinc-700"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("hidePassword") : t("showPassword")}
          className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center rounded p-1 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <EyeIcon crossed={visible} />
        </button>
      </span>
    </label>
  );
}
