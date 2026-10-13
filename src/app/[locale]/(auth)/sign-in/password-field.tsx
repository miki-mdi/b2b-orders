"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FormField, inputStyles } from "@/components/ui/form-field";

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
    <FormField label={t("password")} htmlFor="password">
      <div className="relative">
        <input
          id="password"
          name="password"
          type={visible ? "text" : "password"}
          required
          autoComplete="current-password"
          className={`${inputStyles} pr-10`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("hidePassword") : t("showPassword")}
          className="absolute inset-y-0 right-0 flex items-center rounded-control px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <EyeIcon crossed={visible} />
        </button>
      </div>
    </FormField>
  );
}
