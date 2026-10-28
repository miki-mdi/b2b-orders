import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability } from "@/lib/auth/permissions";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { CustomerForm } from "../customer-form";
import { createCustomerAction } from "../actions";

export default async function NewCustomerPage() {
  const session = await requireSellerSession();
  requireSellerCapability(session, "customers:write:full");
  const t = await getTranslations("seller.customers");
  const tCommon = await getTranslations("seller.common");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-2">
        <Link href="/seller/customers" className={buttonStyles("ghost")}>
          {tCommon("backToList")}
        </Link>
        <PageHeader title={t("newTitle")} />
      </div>
      <Card accentBorder className="max-w-xl p-6 lg:max-w-4xl xl:max-w-5xl">
        <CustomerForm action={createCustomerAction} />
      </Card>
    </div>
  );
}
