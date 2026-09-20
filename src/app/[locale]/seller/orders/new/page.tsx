import { getLocale, getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { listCustomers } from "@/lib/domain/customers/customer-service";
import { listCustomerAddresses } from "@/lib/domain/customers/customer-address-service";
import { listBuyerCatalog, listBuyerCategories } from "@/lib/domain/catalog/buyer-catalog-service";
import { SellerBasketProvider } from "./seller-basket-context";
import { AddToBasketControl } from "./add-to-basket-control";
import { SellerOrderSummary } from "./seller-order-summary";

export default async function NewSellerOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; category?: string; q?: string }>;
}) {
  const session = await requireSellerSession();
  const { customerId, category, q } = await searchParams;
  const t = await getTranslations("seller.orders");
  const locale = await getLocale();

  const customers = await listCustomers(session.tenantId);

  const [catalogItems, categories, addresses] = customerId
    ? await Promise.all([
        listBuyerCatalog(session.tenantId, customerId, { categoryId: category || undefined, search: q || undefined }),
        listBuyerCategories(session.tenantId, customerId),
        listCustomerAddresses(session.tenantId, customerId),
      ])
    : [[], [], []];

  const activeAddresses = addresses.filter((address) => address.isActive);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("newOrderTitle")}</h1>

      <form method="GET" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t("selectCustomer")}
          <select
            name="customerId"
            defaultValue={customerId ?? ""}
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          >
            <option value="">{t("selectCustomer")}</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          {t("chooseCustomer")}
        </button>
      </form>

      {customerId && (
        <SellerBasketProvider>
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex flex-1 flex-col gap-4">
              <form method="GET" className="flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="customerId" value={customerId} />
                <label className="sr-only" htmlFor="new-order-search">
                  {t("catalogSearchPlaceholder")}
                </label>
                <input
                  id="new-order-search"
                  type="search"
                  name="q"
                  defaultValue={q ?? ""}
                  placeholder={t("catalogSearchPlaceholder")}
                  className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
                />
                <label className="sr-only" htmlFor="new-order-category">
                  {t("categoryAll")}
                </label>
                <select
                  id="new-order-category"
                  name="category"
                  defaultValue={category ?? ""}
                  className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
                >
                  <option value="">{t("categoryAll")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {locale === "mk" ? c.nameMk : c.nameEn}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
                >
                  {t("search")}
                </button>
              </form>

              {catalogItems.length === 0 ? (
                <p className="rounded border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
                  {t("basketEmpty")}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {catalogItems.map((item) => (
                    <div
                      key={item.productUnitId}
                      className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                    >
                      <div className="font-medium">{locale === "mk" ? item.nameMk : item.nameEn}</div>
                      <div className="text-xs text-zinc-500">
                        {t("sku")}: {item.sku} / {item.unitSku}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {item.unitLabel} · {locale === "mk" ? item.unitOfMeasureLabelMk : item.unitOfMeasureLabelEn}
                      </div>
                      <div className="mt-1 text-lg font-semibold">
                        {item.price.toFixed(2)} {item.currency}
                      </div>
                      <div className="text-xs text-zinc-500">{t("vatNote", { rate: item.vatRate })}</div>
                      <div className="text-xs text-zinc-500">
                        {t("minQtyNote", { min: item.minOrderQty, increment: item.orderIncrement })}
                      </div>
                      <AddToBasketControl
                        productUnitId={item.productUnitId}
                        minOrderQty={item.minOrderQty}
                        orderIncrement={item.orderIncrement}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:w-96">
              <SellerOrderSummary
                customerId={customerId}
                addresses={activeAddresses.map((address) => ({
                  id: address.id,
                  label: address.label,
                  recipientName: address.recipientName,
                  addressLine1: address.addressLine1,
                  addressLine2: address.addressLine2,
                  city: address.city,
                  isDefaultDelivery: address.isDefaultDelivery,
                }))}
              />
            </div>
          </div>
        </SellerBasketProvider>
      )}
    </div>
  );
}
