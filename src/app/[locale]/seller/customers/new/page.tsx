import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability } from "@/lib/auth/permissions";
import { Link } from "@/i18n/navigation";
import { CustomerForm } from "../customer-form";
import { createCustomerAction } from "../actions";

export default async function NewCustomerPage() {
  const session = await requireSellerSession();
  requireSellerCapability(session, "customers:write:full");
  const t = await getTranslations("seller.customers");
  const tCommon = await getTranslations("seller.common");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/seller/customers" className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("newTitle")}</h1>
      </div>
      <CustomerForm action={createCustomerAction} />
    </div>
  );
}
