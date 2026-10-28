"use client";

import { signOutAction } from "@/lib/auth/sign-out-action";
import { buttonStyles } from "@/components/ui/button";

/**
 * One reusable sign-out control for every authenticated area (Seller
 * header, Buyer header, Admin layout, /connections) - see
 * src/lib/auth/sign-out-action.ts for the Server Action it submits to.
 *
 * A Client Component (not async/server-only) specifically so it can be
 * rendered directly inside SellerHeader/BuyerHeader, which are themselves
 * Client Components - a Server Component can't be mounted inside one's own
 * JSX tree the normal way. `label` is therefore passed in already
 * translated by whichever Server Component layout/page renders this,
 * exactly like moduleLabel/backToSiteLabel already are today.
 *
 * Two variants:
 *  - "button" (default) - a real ghost-button shape (padding, hover
 *    background), used in Admin's top strip, /connections' top strip, and
 *    both mobile hamburger panels, where there's no competing inline
 *    content to crowd.
 *  - "link" - a plain text link the same compact shape as "Back to site",
 *    used ONLY in the Seller/Buyer desktop header row. That row was
 *    already measured to overflow at ~768-1270px window widths with the
 *    full-size button (and, confirmably, by a larger margin even without
 *    it - see docs/SESSION_HANDOFF.md's cross-seller relationship design
 *    note on this pre-existing header-width issue); "link" keeps this
 *    control's own footprint there as small as "Back to site"'s, so this
 *    phase doesn't add to that pre-existing overflow more than it has to.
 *    Still visually distinct from "Back to site" via weight/color, never
 *    identical styling, per this feature's own requirement.
 */
export function SignOutButton({
  label,
  variant = "button",
  className = "",
}: {
  label: string;
  variant?: "button" | "link";
  className?: string;
}) {
  const buttonClassName =
    variant === "button"
      ? buttonStyles("ghost", "md", className)
      : `text-sm font-semibold text-foreground hover:text-primary ${className}`;

  return (
    <form action={signOutAction}>
      <button type="submit" className={buttonClassName}>
        {label}
      </button>
    </form>
  );
}
