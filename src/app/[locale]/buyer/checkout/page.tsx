import { getTranslations } from "next-intl/server";
import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { listActiveCustomerAddressesForBuyer } from "@/lib/domain/customers/customer-address-service";
import { getTenantCutOffInfo } from "@/lib/domain/orders/order-service";
import { CheckoutForm } from "./checkout-form";

export default async function BuyerCheckoutPage() {
  const session = await requireBuyerSession();
  const t = await getTranslations("buyer.checkout");

  const [addresses, tenant] = await Promise.all([
    listActiveCustomerAddressesForBuyer(session.tenantId, session.customerId),
    getTenantCutOffInfo(session.tenantId, session.customerId),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <CheckoutForm
        addresses={addresses.map((address) => ({
          id: address.id,
          label: address.label,
          recipientName: address.recipientName,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2,
          city: address.city,
          isDefaultDelivery: address.isDefaultDelivery,
        }))}
        cutOffTime={tenant.cutOffTime}
      />
    </div>
  );
}
