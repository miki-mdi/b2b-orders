import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability } from "@/lib/auth/permissions";
import { Link } from "@/i18n/navigation";
import { PriceListForm } from "../price-list-form";
import { createPriceListAction } from "../actions";

export default async function NewPriceListPage() {
  const session = await requireSellerSession();
  requireSellerCapability(session, "pricing:write");
  const t = await getTranslations("seller.priceLists");
  const tCommon = await getTranslations("seller.common");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/seller/price-lists" className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("newTitle")}</h1>
      </div>
      <PriceListForm action={createPriceListAction} />
    </div>
  );
}
