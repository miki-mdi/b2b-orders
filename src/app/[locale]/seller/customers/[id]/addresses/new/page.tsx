import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability } from "@/lib/auth/permissions";
import { getCustomer } from "@/lib/domain/customers/customer-service";
import { AddressForm } from "../address-form";
import { createCustomerAddressAction } from "../actions";

export default async function NewCustomerAddressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: customerId } = await params;
  const session = await requireSellerSession();
  requireSellerCapability(session, "customers:addresses:write");
  const t = await getTranslations("seller.addresses");
  const tCommon = await getTranslations("seller.common");

  const customer = await getCustomer(session.tenantId, customerId);
  if (!customer) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/seller/customers/${customerId}/edit`} className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("newTitle")}</h1>
        <p className="text-sm text-zinc-500">{customer.name}</p>
      </div>
      <AddressForm action={createCustomerAddressAction.bind(null, customerId)} />
    </div>
  );
}
