import type { SVGProps } from "react";

const SIZE_MAP = {
  // text is ~50% larger than before (Tailwind's scale lines up exactly:
  // text-base->text-2xl, text-xl->text-3xl, text-2xl->text-4xl) for a more
  // prominent wordmark; badge sizes are unchanged, keeping the icon
  // proportionate (Tailwind's default line-height at each of these text
  // sizes is already close to the matching badge size) and the whole mark
  // compact on mobile.
  sm: { badge: 28, text: "text-2xl" },
  md: { badge: 36, text: "text-3xl" },
  lg: { badge: 44, text: "text-4xl" },
} as const;

export type AppLogoSize = keyof typeof SIZE_MAP;

/**
 * Pure decoration - aria-hidden, since AppLogo's wrapper (role="img" +
 * aria-label) is what assistive tech actually announces. Uses the Phase 1
 * design tokens (fill-primary / fill-primary-foreground), so it tracks
 * light/dark mode automatically the same way the rest of the sign-in page
 * does, with no separate dark: variants needed here.
 */
function LogoMark({ size, ...props }: { size: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" {...props}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      {/* Abstract monogram: a spine + two offset, linked blocks reading as a
          stylized "B" (B2B) built from the same block motif as an order. */}
      <rect x="7" y="7" width="5" height="18" rx="2.5" className="fill-primary-foreground" />
      <rect x="14" y="7" width="11" height="8" rx="4" className="fill-primary-foreground" opacity="0.85" />
      <rect x="14" y="17" width="12" height="8" rx="4" className="fill-primary-foreground" opacity="0.65" />
    </svg>
  );
}

/**
 * Code-native brand mark - inline SVG only, no image asset, no package.
 * role="img" + aria-label on the wrapper gives assistive tech one single
 * accessible name ("B2B Orders") instead of separately reading the
 * decorative mark and the visible wordmark text.
 */
export function AppLogo({ size = "md", className = "" }: { size?: AppLogoSize; className?: string }) {
  const { badge, text } = SIZE_MAP[size];
  return (
    <div role="img" aria-label="B2B Orders" className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={badge} />
      <span className={`font-semibold tracking-tight text-foreground ${text}`}>B2B Orders</span>
    </div>
  );
}
