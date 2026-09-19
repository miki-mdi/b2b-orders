import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { getUnitOfMeasure } from "@/lib/domain/catalog/unit-of-measure-service";
import { UnitForm } from "../../unit-form";
import { updateUnitOfMeasureAction } from "../../actions";

export default async function EditUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSellerSession();
  const t = await getTranslations("seller.units");
  const tCommon = await getTranslations("seller.common");

  const unit = await getUnitOfMeasure(session.tenantId, id);
  if (!unit) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/seller/units" className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("editTitle")}</h1>
      </div>
      <UnitForm action={updateUnitOfMeasureAction.bind(null, id)} unit={unit} />
    </div>
  );
}
