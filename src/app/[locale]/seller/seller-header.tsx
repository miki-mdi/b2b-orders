"use client";

import { useEffect, useRef, useState, type SVGProps } from "react";
import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { AppLogo } from "@/components/brand/app-logo";
import { LanguageThemeControls } from "@/components/language-theme-controls";
import { SignOutButton } from "@/components/sign-out-button";

type NavItem = { href: string; label: string };

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Active = exact match for the dashboard root, prefix match (own section,
 * including sub-routes like /seller/products/1/edit) for everything else. */
function isActiveHref(pathname: string, href: string): boolean {
  if (href === "/seller") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navLinkClass(active: boolean): string {
  return `rounded-control px-3 py-1.5 text-sm font-medium transition-colors ${
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;
}

/**
 * Responsive app header replacing the old always-vertical-on-desktop,
 * horizontally-scrolling-on-mobile sidebar. Desktop: single row, primary
 * items inline, lower-priority items (Categories/Units/Audit/Imports/
 * Exports) collapsed into a "More" dropdown so up to 10 permitted links
 * never need to wrap or scroll. Mobile/tablet: a single menu button opens
 * the full flat link list, no horizontal scroll at any width. Every href,
 * label, and capability gate is computed server-side in layout.tsx exactly
 * as before - this component only decides how to lay them out and tracks
 * which one is "active" via the current pathname.
 */
export function SellerHeader({
  navAriaLabel,
  moduleLabel,
  primaryItems,
  secondaryItems,
  backToSiteLabel,
  signOutLabel,
  moreLabel,
  menuLabel,
}: {
  navAriaLabel: string;
  moduleLabel: string;
  primaryItems: NavItem[];
  secondaryItems: NavItem[];
  backToSiteLabel: string;
  signOutLabel: string;
  moreLabel: string;
  menuLabel: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  const allItems = [...primaryItems, ...secondaryItems];
  const secondaryActive = secondaryItems.some((item) => isActiveHref(pathname, item.href));

  return (
    <header className="border-b border-border bg-surface">
      <div className="flex h-14 items-center gap-2 px-4 nav:px-6">
        <div className="mr-2 flex shrink-0 items-center gap-2 sm:gap-3">
          <Link href="/seller" className="flex items-center">
            <AppLogo size="sm" />
          </Link>
          <span className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
          <span className="shrink-0 whitespace-nowrap text-lg font-semibold tracking-tight text-primary sm:text-2xl">
            {moduleLabel}
          </span>
        </div>

        <nav aria-label={navAriaLabel} className="hidden flex-1 items-center gap-1 nav:flex">
          {primaryItems.map((item) => (
            <Link key={item.href} href={item.href} className={navLinkClass(isActiveHref(pathname, item.href))}>
              {item.label}
            </Link>
          ))}

          {secondaryItems.length > 0 && (
            <div ref={moreRef} className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={moreOpen}
                className={`flex items-center gap-1 ${navLinkClass(secondaryActive)}`}
              >
                {moreLabel}
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </button>
              {moreOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded-control border border-border bg-surface p-1 shadow-card">
                  {secondaryItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={`block ${navLinkClass(isActiveHref(pathname, item.href))}`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        <LanguageThemeControls className="hidden nav:flex" />

        <Link
          href="/"
          className="hidden shrink-0 text-sm font-medium text-muted-foreground hover:text-foreground nav:block"
        >
          {backToSiteLabel}
        </Link>

        <div className="hidden shrink-0 nav:block">
          <SignOutButton label={signOutLabel} variant="link" />
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="seller-mobile-nav"
          aria-label={menuLabel}
          className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-border text-foreground nav:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </div>

      {mobileOpen && (
        <nav
          id="seller-mobile-nav"
          aria-label={navAriaLabel}
          className="flex flex-col gap-1 border-t border-border p-3 nav:hidden"
        >
          <div className="mb-2 flex items-center justify-start gap-2 border-b border-border pb-3">
            <LanguageThemeControls />
          </div>

          {allItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={navLinkClass(isActiveHref(pathname, item.href))}
            >
              {item.label}
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
