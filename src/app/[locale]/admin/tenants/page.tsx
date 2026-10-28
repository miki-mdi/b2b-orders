import { getTranslations } from "next-intl/server";
import { requirePlatformAdminSession } from "@/lib/auth/require-platform-admin";
import { listTenantsForAdmin } from "@/lib/domain/admin/admin-service";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";

export default async function AdminTenantsPage() {
  await requirePlatformAdminSession();
  const t = await getTranslations("admin.tenants");
  const tenants = await listTenantsForAdmin();
  const activeCount = tenants.filter((tenant) => tenant.status === "ACTIVE").length;
  const suspendedCount = tenants.length - activeCount;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile label={t("statTotal")} value={tenants.length} accentBorder />
        <StatTile label={t("statActive")} value={activeCount} accentBorder />
        <StatTile label={t("statSuspended")} value={suspendedCount} accentBorder />
      </div>

      {tenants.length === 0 ? (
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
                  {t("columnSlug")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnVat")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnStatus")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnMembers")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnCustomers")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnOrders")}
                </th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-t border-border">
                  <td className="px-4 py-2 text-foreground">{tenant.name}</td>
                  <td className="px-4 py-2 font-mono text-foreground">{tenant.slug}</td>
                  <td className="px-4 py-2 text-foreground">{tenant.defaultVatRate}%</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        tenant.status === "ACTIVE" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                      }`}
                    >
                      {t(`status.${tenant.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-foreground">{tenant.memberCount}</td>
                  <td className="px-4 py-2 text-foreground">{tenant.customerCount}</td>
                  <td className="px-4 py-2 text-foreground">{tenant.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
