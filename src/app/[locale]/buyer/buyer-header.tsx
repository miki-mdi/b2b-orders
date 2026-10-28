"use client";

import { useState, type SVGProps } from "react";
import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { AppLogo } from "@/components/brand/app-logo";
import { LanguageThemeControls } from "@/components/language-theme-controls";
import { SignOutButton } from "@/components/sign-out-button";
import { CartBadge } from "@/components/buyer/cart-badge";

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

/** Exact match for /buyer/catalog, prefix match (own section) for everything else - same rule as seller-header.tsx's isActiveHref. */
function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navLinkClass(active: boolean): string {
  return `flex items-center rounded-control px-3 py-1.5 text-sm font-medium transition-colors ${
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;
}

/**
 * Buyer equivalent of seller-header.tsx - same responsive shell (single-row
 * desktop header, hamburger-opened mobile panel) applied to Buyer's links
 * instead of Seller's primary/secondary split, since this list never needs
 * a "More" dropdown. Every href/label/capability (none here - Buyer has no
 * per-link role gates) stays exactly what buyer/layout.tsx already passed
 * in before this redesign.
 */
export function BuyerHeader({
  navAriaLabel,
  moduleLabel,
  catalogLabel,
  cartLabel,
  ordersLabel,
  sellersLabel,
  connectionsLabel,
  backToSiteLabel,
  signOutLabel,
  menuLabel,
}: {
  navAriaLabel: string;
  moduleLabel: string;
  catalogLabel: string;
  cartLabel: string;
  ordersLabel: string;
  sellersLabel: string;
  connectionsLabel: string;
  backToSiteLabel: string;
  signOutLabel: string;
  menuLabel: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { href: "/buyer/catalog" as const, label: catalogLabel, withCartBadge: false },
    { href: "/buyer/cart" as const, label: cartLabel, withCartBadge: true },
    { href: "/buyer/orders" as const, label: ordersLabel, withCartBadge: false },
    { href: "/buyer/sellers" as const, label: sellersLabel, withCartBadge: false },
    // Outside the /buyer prefix on purpose - it's where a buyer manages
    // invitations across EVERY seller, not just the one they're currently
    // scoped to (see /[locale]/connections/page.tsx's own module comment).
    { href: "/connections" as const, label: connectionsLabel, withCartBadge: false },
  ];

  return (
    <header className="border-b border-border bg-surface">
      <div className="flex h-14 items-center gap-2 px-4 nav:px-6">
        <div className="mr-2 flex shrink-0 items-center gap-2 sm:gap-3">
          <Link href="/buyer/catalog" className="flex items-center">
            <AppLogo size="sm" />
          </Link>
          <span className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
          <span className="shrink-0 whitespace-nowrap text-lg font-semibold tracking-tight text-primary sm:text-2xl">
            {moduleLabel}
          </span>
        </div>

        <nav aria-label={navAriaLabel} className="hidden flex-1 items-center gap-1 nav:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={navLinkClass(isActiveHref(pathname, item.href))}>
              {item.label}
              {item.withCartBadge && <CartBadge />}
            </Link>
          ))}
        </nav>

        <LanguageThemeControls className="hidden nav:flex" />

        <Link href="/" className="hidden shrink-0 text-sm font-medium text-muted-foreground hover:text-foreground nav:block">
          {backToSiteLabel}
        </Link>

        <div className="hidden shrink-0 nav:block">
          <SignOutButton label={signOutLabel} variant="link" />
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="buyer-mobile-nav"
          aria-label={menuLabel}
          className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-border text-foreground nav:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </div>

      {mobileOpen && (
        <nav id="buyer-mobile-nav" aria-label={navAriaLabel} className="flex flex-col gap-1 border-t border-border p-3 nav:hidden">
          <div className="mb-2 flex items-center justify-start gap-2 border-b border-border pb-3">
            <LanguageThemeControls />
          </div>

          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={navLinkClass(isActiveHref(pathname, item.href))}
            >
              {item.label}
              {item.withCartBadge && <CartBadge />}
            </Link>
          ))}
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className="rounded-control px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {backToSiteLabel}
          </Link>

          <div className="mt-2 border-t border-border pt-3">
            <SignOutButton label={signOutLabel} />
          </div>
        </nav>
      )}
    </header>
  );
}
