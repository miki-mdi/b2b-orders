import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { hasCapability } from "@/lib/auth/permissions";
import { SellerHeader } from "./seller-header";

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  // Redirects away if this isn't an active seller (TENANT) session - see
  // src/lib/auth/require-seller.ts. Every page under this layout can
  // therefore assume a valid tenantId is available without re-checking.
  const session = await requireSellerSession();
  const t = await getTranslations("seller.nav");
  // "home" namespace deliberately reused, not a new "seller.nav.signOut" key
  // - the home page's existing no-access state already has exactly this
  // label in both locales (src/lib/auth/sign-out-action.ts's own comment).
  const tHome = await getTranslations("home");

  // Cosmetic only (Phase 1F-B1) - each linked page enforces its own
  // capability server-side (src/lib/auth/permissions.ts); hiding a link here
  // never substitutes for that. Every role has some order-read capability,
  // so Orders is never hidden. Exact same checks as before this redesign -
  // only how the resulting items are grouped/displayed changed.
  const showCategories = hasCapability(session.role, "catalog:read");
  const showUnits = hasCapability(session.role, "catalog:read");
  const showProducts = hasCapability(session.role, "catalog:read");
  const showCustomers = hasCapability(session.role, "customers:read");
  const showPriceLists = hasCapability(session.role, "pricing:read");
  const showAudit = hasCapability(session.role, "audit:read");
  const showImports = hasCapability(session.role, "imports:manage");
  const showExports = hasCapability(session.role, "exports:read");
  const showBuyerRequests = hasCapability(session.role, "customers:write:full");

  // Primary = the daily-task items (same grouping as the dashboard's own
  // quick actions), kept inline on desktop. Secondary = lower-frequency
  // catalog-admin/reporting items, collapsed into the "More" dropdown so
  // up to 10 permitted links never wrap or need horizontal scroll.
  const primaryItems = [
    { href: "/seller", label: t("dashboard") },
    { href: "/seller/orders", label: t("orders") },
    ...(showProducts ? [{ href: "/seller/products", label: t("products") }] : []),
    ...(showCustomers ? [{ href: "/seller/customers", label: t("customers") }] : []),
    ...(showPriceLists ? [{ href: "/seller/price-lists", label: t("priceLists") }] : []),
  ];

  const secondaryItems = [
    ...(showCategories ? [{ href: "/seller/categories", label: t("categories") }] : []),
    ...(showUnits ? [{ href: "/seller/units", label: t("units") }] : []),
    ...(showBuyerRequests ? [{ href: "/seller/buyer-requests", label: t("buyerRequests") }] : []),
    ...(showAudit ? [{ href: "/seller/audit", label: t("audit") }] : []),
    ...(showImports ? [{ href: "/seller/imports", label: t("imports") }] : []),
    ...(showExports ? [{ href: "/seller/exports", label: t("exports") }] : []),
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SellerHeader
        navAriaLabel={t("title")}
        moduleLabel={t("moduleBadge")}
        primaryItems={primaryItems}
        secondaryItems={secondaryItems}
        backToSiteLabel={t("backToSite")}
        signOutLabel={tHome("signOut")}
        moreLabel={t("more")}
        menuLabel={t("menu")}
      />
      {/* min-w-0 defensively prevents a wide child (e.g. the Imports
          wizard's min-w-[640px] results table) from forcing `main` wider
          than the viewport - the table's own overflow-x-auto wrapper is
          what should scroll, not the page. Kept from the previous sidebar
          layout's fix for the same underlying concern (see git history on
          this file) even though a top header removes the original
          flex-row sibling-width competition that first required it. */}
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
