import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";

const EXPORTS = [
  { key: "customers", path: "/api/seller/export/customers" },
  { key: "products", path: "/api/seller/export/products" },
  { key: "priceLists", path: "/api/seller/export/price-lists" },
  { key: "orders", path: "/api/seller/export/orders" },
  { key: "orderLines", path: "/api/seller/export/order-lines" },
] as const;

export default async function SellerExportsPage() {
  // Guard only - the actual tenant scoping happens per-request inside each
  // /api/seller/export/* route handler (its own requireSellerSession call),
  // exactly like every other seller page/action in this codebase. Each of
  // those route handlers also re-checks exports:read itself (Phase 1F-B1) -
  // this page-level check is only so an unauthorized role never even sees
  // the download links.
  const session = await requireSellerSession();
  requireSellerCapability(session, "exports:read");
  const t = await getTranslations("seller.exports");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} subtitle={t("intro")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {EXPORTS.map((item) => (
          <Card key={item.key} accentBorder className="flex flex-col gap-3 p-4">
            <span className="text-sm font-medium text-foreground">{t(item.key)}</span>
            <a href={item.path} className={buttonStyles("primary")}>
              {t("download")}
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}
