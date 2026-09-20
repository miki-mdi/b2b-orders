import { getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability, hasCapability } from "@/lib/auth/permissions";
import { listUnitsOfMeasure } from "@/lib/domain/catalog/unit-of-measure-service";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/seller/status-badge";
import { ToggleActiveForm } from "@/components/seller/toggle-active-form";
import { toggleUnitOfMeasureActiveAction } from "./actions";

export default async function UnitsPage() {
  const session = await requireSellerSession();
  requireSellerCapability(session, "catalog:read");
  const canWrite = hasCapability(session.role, "catalog:write");
  const t = await getTranslations("seller.units");
  const tCommon = await getTranslations("seller.common");
  const units = await listUnitsOfMeasure(session.tenantId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {canWrite && (
          <Link
            href="/seller/units/new"
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            {tCommon("addNew")}
          </Link>
        )}
      </div>

      {units.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnCode")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnLabel")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {tCommon("status")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {tCommon("actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-4 py-2 font-mono">{unit.code}</td>
                  <td className="px-4 py-2">
                    <div>{unit.labelEn}</div>
                    <div className="text-xs text-zinc-500">{unit.labelMk}</div>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge isActive={unit.isActive} activeLabel={tCommon("active")} inactiveLabel={tCommon("inactive")} />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <Link href={`/seller/units/${unit.id}/edit`} className="text-sm underline underline-offset-2">
                        {canWrite ? tCommon("edit") : tCommon("view")}
                      </Link>
                      {canWrite && (
                        <ToggleActiveForm
                          action={toggleUnitOfMeasureActiveAction.bind(null, unit.id, !unit.isActive)}
                          isActive={unit.isActive}
                          deactivateLabel={tCommon("deactivate")}
                          reactivateLabel={tCommon("reactivate")}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
