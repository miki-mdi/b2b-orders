import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";

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
  // exactly like every other seller page/action in this codebase.
  await requireSellerSession();
  const t = await getTranslations("seller.exports");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {EXPORTS.map((item) => (
          <a
            key={item.key}
            href={item.path}
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <span className="text-sm font-medium">{t(item.key)}</span>
            <span className="text-sm underline underline-offset-2">{t("download")}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
