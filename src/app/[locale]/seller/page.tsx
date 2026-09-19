import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function SellerDashboardPage() {
  const t = await getTranslations("seller.dashboard");

  const cards = [
    { href: "/seller/categories" as const, label: t("categoriesCard") },
    { href: "/seller/units" as const, label: t("unitsCard") },
    { href: "/seller/products" as const, label: t("productsCard") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-lg border border-zinc-200 p-4 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            {card.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
