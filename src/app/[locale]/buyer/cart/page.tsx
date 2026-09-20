import { getTranslations } from "next-intl/server";
import { requireBuyerSession } from "@/lib/auth/require-buyer";
import { CartView } from "./cart-view";

export default async function BuyerCartPage() {
  // The cart itself lives in the browser (see src/lib/cart/cart-storage.ts),
  // but the route is still gated the same as every other buyer page.
  await requireBuyerSession();
  const t = await getTranslations("buyer.cart");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <CartView />
    </div>
  );
}
