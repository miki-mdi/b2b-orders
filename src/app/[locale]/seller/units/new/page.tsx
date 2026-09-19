import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { UnitForm } from "../unit-form";
import { createUnitOfMeasureAction } from "../actions";

export default async function NewUnitPage() {
  const t = await getTranslations("seller.units");
  const tCommon = await getTranslations("seller.common");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/seller/units" className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("newTitle")}</h1>
      </div>
      <UnitForm action={createUnitOfMeasureAction} />
    </div>
  );
}
