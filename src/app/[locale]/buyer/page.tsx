import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

// The buyer portal's landing point is the catalog - there is no separate
// dashboard to build for Phase 1C.
export default async function BuyerHomePage() {
  const locale = await getLocale();
  redirect({ href: "/buyer/catalog", locale });
}
