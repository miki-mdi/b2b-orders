import { getTranslations } from "next-intl/server";
import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { PageHeader } from "@/components/ui/page-header";
import { CartView } from "./cart-view";

export default async function BuyerCartPage() {
  // The cart itself lives in the browser (see src/lib/cart/cart-storage.ts),
  // but the route is still gated the same as every other buyer page.
  await requireBuyerSession();
  const t = await getTranslations("buyer.cart");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} />
      <CartView />
    </div>
  );
}
