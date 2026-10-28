import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability, hasCapability } from "@/lib/auth/permissions";
import { listCustomersPage } from "@/lib/domain/customers/customer-service";
import { clampPage } from "@/lib/pagination";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/seller/status-badge";
import { ToggleActiveForm } from "@/components/seller/toggle-active-form";
import { Pagination } from "@/components/seller/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { toggleCustomerActiveAction } from "./actions";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requireSellerSession();
  requireSellerCapability(session, "customers:read");
  const canCreate = hasCapability(session.role, "customers:write:full");
  const canEdit = canCreate || hasCapability(session.role, "customers:write:limited");
  const canActivate = hasCapability(session.role, "customers:activate");
  const { page: pageParam } = await searchParams;
  const t = await getTranslations("seller.customers");
  const tCommon = await getTranslations("seller.common");
  const page = clampPage(pageParam);
  const result = await listCustomersPage(session.tenantId, page);
  const customers = result.items;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("title")}
        action={
          canCreate ? (
            <Link href="/seller/customers/new" className={buttonStyles("primary")}>
              {tCommon("addNew")}
            </Link>
          ) : undefined
        }
      />

      {customers.length === 0 ? (
        <p className="rounded-control border border-dashed border-border p-8 text-center text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <Card accentBorder className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnName")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnCode")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnContact")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {tCommon("status")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {tCommon("actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-t border-border">
                  <td className="px-4 py-2 text-foreground">{customer.name}</td>
                  <td className="px-4 py-2 font-mono text-foreground">{customer.code ?? "—"}</td>
                  <td className="px-4 py-2 text-foreground">{customer.contactEmail ?? customer.contactPhone ?? "—"}</td>
                  <td className="px-4 py-2">
                    <StatusBadge isActive={customer.isActive} activeLabel={tCommon("active")} inactiveLabel={tCommon("inactive")} />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/seller/customers/${customer.id}/edit`}
                        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {canEdit ? tCommon("edit") : tCommon("view")}
                      </Link>
                      {canActivate && (
                        <ToggleActiveForm
                          action={toggleCustomerActiveAction.bind(null, customer.id, !customer.isActive)}
                          isActive={customer.isActive}
                          deactivateLabel={tCommon("deactivate")}
                          reactivateLabel={tCommon("reactivate")}
                          tone="danger"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        buildHref={(targetPage) => (targetPage > 1 ? `/seller/customers?page=${targetPage}` : "/seller/customers")}
        previousLabel={tCommon("previous")}
        nextLabel={tCommon("next")}
        summaryLabel={tCommon("pageSummary", { page: result.page, totalPages: result.totalPages, total: result.total })}
      />
    </div>
  );
}
