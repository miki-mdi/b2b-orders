import { getTranslations } from "next-intl/server";
import { requirePlatformAdminSession } from "@/lib/auth/require-platform-admin";
import { listUsersForAdmin } from "@/lib/domain/admin/admin-service";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";

export default async function AdminUsersPage() {
  await requirePlatformAdminSession();
  const t = await getTranslations("admin.users");
  const users = await listUsersForAdmin();
  const activeCount = users.filter((user) => user.isActive).length;
  const platformAdminCount = users.filter((user) => user.isPlatformAdmin).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile label={t("statTotal")} value={users.length} accentBorder />
        <StatTile label={t("statActive")} value={activeCount} accentBorder />
        <StatTile label={t("statPlatformAdmins")} value={platformAdminCount} accentBorder />
      </div>

      {users.length === 0 ? (
        <p className="rounded-control border border-dashed border-border p-8 text-center text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <Card accentBorder className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnUser")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnStatus")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnPlatformAdmin")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnMemberships")}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <div className="text-foreground">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.isActive ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {user.isActive ? t("statusActive") : t("statusInactive")}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-foreground">{user.isPlatformAdmin ? t("yes") : t("no")}</td>
                  <td className="px-4 py-2">
                    {user.memberships.length === 0 ? (
                      <span className="text-xs text-muted-foreground">{t("noMemberships")}</span>
                    ) : (
                      <ul className="flex flex-col gap-1 text-xs">
                        {user.memberships.map((membership, index) => (
                          <li
                            key={index}
                            className={membership.isActive ? "text-foreground" : "text-muted-foreground line-through"}
                          >
                            {membership.label} · {membership.role}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
