import type { HTMLAttributes } from "react";

/**
 * accentBorder is opt-in and defaults to false, so every existing Card
 * usage (sign-in, etc.) keeps its exact current border-border look -
 * only call sites that explicitly pass accentBorder get the subtle
 * brand-blue border instead.
 */
export function Card({
  className = "",
  accentBorder = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { accentBorder?: boolean }) {
  return (
    <div
      className={`rounded-surface border ${accentBorder ? "border-primary/20" : "border-border"} bg-surface shadow-card ${className}`}
      {...props}
    />
  );
}
