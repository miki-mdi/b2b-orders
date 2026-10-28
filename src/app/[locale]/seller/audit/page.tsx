import { getLocale, getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { requireSellerCapability } from "@/lib/auth/permissions";
import {
  listAuditLogActors,
  listAuditLogEntries,
  listAuditLogFacets,
  type AuditLogFilter,
} from "@/lib/domain/audit/audit-query-service";
import { clampPage } from "@/lib/pagination";
import { Link } from "@/i18n/navigation";
import { Pagination } from "@/components/seller/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button, buttonStyles } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/form-field";

type AuditSearchParams = {
  dateFrom?: string;
  dateTo?: string;
  actorUserId?: string;
  entityType?: string;
  action?: string;
  page?: string;
};

function parseDate(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
}

const MAX_DISPLAY_VALUE_LENGTH = 120;

/** Old/new values can be a whole-row JSON snapshot (see writeAuditLogEntry) - truncated here so one CREATE row never blows out the table layout; the full untruncated value is still in the database, this is a display concern only. */
function truncateForDisplay(value: string | null): string | null {
  if (value === null) return null;
  return value.length > MAX_DISPLAY_VALUE_LENGTH ? `${value.slice(0, MAX_DISPLAY_VALUE_LENGTH)}…` : value;
}

function buildQuery(params: AuditSearchParams, page: number): string {
  const query = new URLSearchParams();
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  if (params.actorUserId) query.set("actorUserId", params.actorUserId);
  if (params.entityType) query.set("entityType", params.entityType);
  if (params.action) query.set("action", params.action);
  if (page > 1) query.set("page", String(page));
  const qs = query.toString();
  return qs ? `/seller/audit?${qs}` : "/seller/audit";
}

export default async function SellerAuditLogPage({ searchParams }: { searchParams: Promise<AuditSearchParams> }) {
  const session = await requireSellerSession();
  requireSellerCapability(session, "audit:read");
  const params = await searchParams;
  const t = await getTranslations("seller.audit");
  const tCommon = await getTranslations("seller.common");
  const locale = await getLocale();

  const filter: AuditLogFilter = {
    dateFrom: parseDate(params.dateFrom, false),
    dateTo: parseDate(params.dateTo, true),
    actorUserId: params.actorUserId || undefined,
    entityType: params.entityType || undefined,
    action: params.action || undefined,
  };
  const page = clampPage(params.page);

  const [result, actors, facets] = await Promise.all([
    listAuditLogEntries(session.tenantId, filter, page, 25),
    listAuditLogActors(session.tenantId),
    listAuditLogFacets(session.tenantId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} subtitle={t("intro")} />

      <Card accentBorder className="p-3">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="dateFrom" className="text-xs font-medium text-muted-foreground">
              {t("filterDateFrom")}
            </label>
            <input
              id="dateFrom"
              type="date"
              name="dateFrom"
              defaultValue={params.dateFrom ?? ""}
              className={`${inputStyles} w-auto`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="dateTo" className="text-xs font-medium text-muted-foreground">
              {t("filterDateTo")}
            </label>
            <input
              id="dateTo"
              type="date"
              name="dateTo"
              defaultValue={params.dateTo ?? ""}
              className={`${inputStyles} w-auto`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="actorUserId" className="text-xs font-medium text-muted-foreground">
              {t("filterActor")}
            </label>
            <select
              id="actorUserId"
              name="actorUserId"
              defaultValue={params.actorUserId ?? ""}
              className={`${inputStyles} w-auto`}
            >
              <option value="">{t("filterActorAll")}</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="entityType" className="text-xs font-medium text-muted-foreground">
              {t("filterEntityType")}
            </label>
            <select
              id="entityType"
              name="entityType"
              defaultValue={params.entityType ?? ""}
              className={`${inputStyles} w-auto`}
            >
              <option value="">{t("filterEntityTypeAll")}</option>
              {facets.entityTypes.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {entityType}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="action" className="text-xs font-medium text-muted-foreground">
              {t("filterAction")}
            </label>
            <select
              id="action"
              name="action"
              defaultValue={params.action ?? ""}
              className={`${inputStyles} w-auto`}
            >
              <option value="">{t("filterActionAll")}</option>
              {facets.actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">{t("apply")}</Button>
          <Link href="/seller/audit" className={buttonStyles("ghost")}>
            {t("reset")}
          </Link>
        </form>
      </Card>

      {result.entries.length === 0 ? (
        <Card accentBorder className="border-dashed p-8 text-center text-muted-foreground">
          {t("empty")}
        </Card>
      ) : (
        <Card accentBorder className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnDate")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnActor")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnContext")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnEntity")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnAction")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnField")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnChange")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-foreground">
                  {t("columnReason")}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-foreground">{entry.createdAt.toLocaleString(locale)}</td>
                  <td className="px-4 py-2 text-foreground">{entry.actorName ?? t("systemActor")}</td>
                  <td className="px-4 py-2 text-foreground">{entry.actingContext}</td>
                  <td className="px-4 py-2">
                    <div className="text-foreground">{entry.entityType}</div>
                    {entry.entityReference && <div className="text-xs text-muted-foreground">{entry.entityReference}</div>}
                  </td>
                  <td className="px-4 py-2 text-foreground">{entry.action}</td>
                  <td className="px-4 py-2 text-foreground">{entry.fieldName ?? "—"}</td>
                  <td className="px-4 py-2 text-foreground">
                    {entry.oldValue || entry.newValue ? (
                      <span>
                        {truncateForDisplay(entry.oldValue) ?? "—"} → {truncateForDisplay(entry.newValue) ?? "—"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-foreground">{entry.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        buildHref={(targetPage) => buildQuery(params, targetPage)}
        previousLabel={tCommon("previous")}
        nextLabel={tCommon("next")}
        summaryLabel={tCommon("pageSummary", { page: result.page, totalPages: result.totalPages, total: result.total })}
      />
    </div>
  );
}
