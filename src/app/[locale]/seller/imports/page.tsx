import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability } from "@/lib/auth/permissions";
import { Link } from "@/i18n/navigation";
import { IMPORT_TYPES } from "@/lib/domain/import/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";

export default async function SellerImportsPage() {
  const session = await requireSellerSession();
  requireSellerCapability(session, "imports:manage");
  const t = await getTranslations("seller.imports");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} subtitle={t("intro")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {IMPORT_TYPES.map((type) => (
          <Card key={type} accentBorder className="flex flex-col gap-3 p-4">
            <span className="text-sm font-medium text-foreground">{t(`types.${type}`)}</span>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/seller/imports/${type}`} className={buttonStyles("primary")}>
                {t("startImport")}
              </Link>
              <a href={`/api/seller/import/template/${type}`} className={buttonStyles("ghost")}>
                {t("downloadTemplate")}
              </a>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
