import type { ReactNode } from "react";

/**
 * Formalizes the tinted-banner pattern already used ad hoc elsewhere (e.g.
 * the seller dashboard's invalid-range warning, AddressForm's error
 * banner) - same literal Tailwind color scale those already use, now with
 * a consistent `role="alert"` (src/components/forms/field-error.tsx
 * already follows this same convention for inline field errors).
 */
const TONE_STYLES = {
  info: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  success: "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
  warning: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  danger: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
} as const;

export type AlertTone = keyof typeof TONE_STYLES;

export function Alert({ tone = "info", children }: { tone?: AlertTone; children: ReactNode }) {
  return (
    <p role="alert" className={`rounded-control border px-3 py-2 text-sm ${TONE_STYLES[tone]}`}>
      {children}
    </p>
  );
}
