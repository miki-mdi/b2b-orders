import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability } from "@/lib/auth/permissions";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { PriceListForm } from "../price-list-form";
import { createPriceListAction } from "../actions";

export default async function NewPriceListPage() {
  const session = await requireSellerSession();
  requireSellerCapability(session, "pricing:write");
  const t = await getTranslations("seller.priceLists");
  const tCommon = await getTranslations("seller.common");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-2">
        <Link href="/seller/price-lists" className={buttonStyles("ghost")}>
          {tCommon("backToList")}
        </Link>
        <PageHeader title={t("newTitle")} />
      </div>
      <Card accentBorder className="max-w-4xl p-6">
        <PriceListForm action={createPriceListAction} />
      </Card>
    </div>
  );
}
