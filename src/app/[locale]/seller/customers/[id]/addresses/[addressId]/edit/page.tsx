import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability, hasCapability } from "@/lib/auth/permissions";
import { getCustomerAddress } from "@/lib/domain/customers/customer-address-service";
import { AddressForm } from "../../address-form";
import { updateCustomerAddressAction } from "../../actions";

export default async function EditCustomerAddressPage({
  params,
}: {
  params: Promise<{ id: string; addressId: string }>;
}) {
  const { id: customerId, addressId } = await params;
  const session = await requireSellerSession();
  requireSellerCapability(session, "customers:read");
  const readOnly = !hasCapability(session.role, "customers:addresses:write");
  const t = await getTranslations("seller.addresses");
  const tCommon = await getTranslations("seller.common");

  const address = await getCustomerAddress(session.tenantId, addressId);
  if (!address || address.customerId !== customerId) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/seller/customers/${customerId}/edit`} className="text-sm underline underline-offset-2">
          {tCommon("backToList")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{readOnly ? t("viewTitle") : t("editTitle")}</h1>
      </div>
      <AddressForm
        action={updateCustomerAddressAction.bind(null, customerId, addressId)}
        address={address}
        readOnly={readOnly}
      />
    </div>
  );
}
