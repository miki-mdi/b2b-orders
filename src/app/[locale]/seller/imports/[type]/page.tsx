import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { IMPORT_TEMPLATES } from "@/lib/domain/import/templates";
import { IMPORT_TYPES, type ImportType } from "@/lib/domain/import/types";
import { ImportWizard } from "./import-wizard";

function isImportType(value: string): value is ImportType {
  return (IMPORT_TYPES as readonly string[]).includes(value);
}

export default async function SellerImportTypePage({ params }: { params: Promise<{ type: string }> }) {
  // Guard only - actual tenant scoping happens per-request inside the
  // Server Actions this page's wizard calls, same pattern as /seller/exports.
  await requireSellerSession();
  const { type } = await params;

  if (!isImportType(type)) {
    notFound();
  }

  const t = await getTranslations("seller.imports");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t(`types.${type}`)}</h1>
        <p className="mt-1 max-w-2xl text-zinc-600 dark:text-zinc-400">{t("wizardIntro")}</p>
      </div>
      <ImportWizard importType={type} templateHeaders={IMPORT_TEMPLATES[type].headers} />
    </div>
  );
}
