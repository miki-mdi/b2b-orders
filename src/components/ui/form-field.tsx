import type { ReactNode } from "react";

/**
 * Shared input styling, exported so any input placed inside a FormField
 * (including a more complex one like the password field's icon-overlay
 * layout) stays visually identical without repeating this class string.
 *
 * Uses --input-border (not --border, which stays reserved for Card/table
 * hairlines) so the field boundary itself stays visible against the card
 * background in dark mode, where --border is nearly indistinguishable from
 * --surface. hover/focus-visible both step up in strength from there:
 * hover to --muted-foreground, focus-visible to the primary brand color
 * (on top of the existing focus ring, not replacing it).
 */
export const inputStyles =
  "w-full rounded-control border border-input-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus-ring";

export function FormField({
  label,
  htmlFor,
  error,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
