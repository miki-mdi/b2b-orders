import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { Link } from "@/i18n/navigation";
import { IMPORT_TYPES } from "@/lib/domain/import/types";

export default async function SellerImportsPage() {
  await requireSellerSession();
  const t = await getTranslations("seller.imports");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {IMPORT_TYPES.map((type) => (
          <div key={type} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <span className="text-sm font-medium">{t(`types.${type}`)}</span>
            <Link href={`/seller/imports/${type}`} className="text-sm underline underline-offset-2">
              {t("startImport")}
            </Link>
            <a
              href={`/api/seller/import/template/${type}`}
              className="text-sm text-zinc-500 underline underline-offset-2 dark:text-zinc-500"
            >
              {t("downloadTemplate")}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
