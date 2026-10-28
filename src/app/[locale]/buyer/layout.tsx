import { getTranslations } from "next-intl/server";
import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { BuyerHeader } from "./buyer-header";

export default async function BuyerLayout({ children }: { children: React.ReactNode }) {
  // Redirects away if this isn't an active buyer (CUSTOMER) session - see
  // src/lib/auth/require-buyer.ts. Every page under this layout can
  // therefore assume a valid tenantId/customerId is available without
  // re-checking, and a seller-admin session is never shown these routes.
  await requireBuyerSession();
  const t = await getTranslations("buyer.nav");
  // "home" namespace deliberately reused - see seller/layout.tsx's identical comment.
  const tHome = await getTranslations("home");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* BuyerHeader replaced the old sidebar nav - see buyer-header.tsx. */}
      <BuyerHeader
        navAriaLabel={t("title")}
        moduleLabel={t("moduleBadge")}
        catalogLabel={t("catalog")}
        cartLabel={t("cart")}
        ordersLabel={t("orders")}
        sellersLabel={t("sellers")}
        connectionsLabel={t("connections")}
        backToSiteLabel={t("backToSite")}
        signOutLabel={tHome("signOut")}
        menuLabel={t("menu")}
      />
      {/* min-w-0 defensively prevents a wide child (e.g. the catalog's
          product grid) from forcing `main` wider than the viewport - same
          fix already applied to seller/layout.tsx for the same reason. */}
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
