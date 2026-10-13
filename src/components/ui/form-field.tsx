import type { ReactNode } from "react";

/**
 * Shared input styling, exported so any input placed inside a FormField
 * (including a more complex one like the password field's icon-overlay
 * layout) stays visually identical without repeating this class string.
 */
export const inputStyles =
  "w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

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
