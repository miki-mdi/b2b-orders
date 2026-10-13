import type { ButtonHTMLAttributes } from "react";

const VARIANT_STYLES = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "border border-border bg-surface text-foreground hover:bg-muted",
  danger: "bg-danger text-danger-foreground hover:opacity-90",
  ghost: "text-foreground hover:bg-muted",
} as const;

const SIZE_STYLES = {
  md: "px-4 py-2 text-sm",
  icon: "p-1.5",
} as const;

export type ButtonVariant = keyof typeof VARIANT_STYLES;
export type ButtonSize = keyof typeof SIZE_STYLES;

/**
 * Plain presentational button - no "use client" here, so it stays usable
 * directly from a server component (e.g. a submit button on a server-
 * rendered form) as well as from inside an already-client component (e.g.
 * an icon toggle with an onClick) without forcing an extra client boundary
 * on whichever page imports it.
 */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${className}`}
      {...props}
    />
  );
}
