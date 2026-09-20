import { getLocale, getTranslations } from "next-intl/server";
import { requireSellerSession } from "@/lib/auth/require-seller";
import {
  listAuditLogActors,
  listAuditLogEntries,
  listAuditLogFacets,
  type AuditLogFilter,
} from "@/lib/domain/audit/audit-query-service";
import { clampPage } from "@/lib/pagination";
import { Link } from "@/i18n/navigation";
import { Pagination } from "@/components/seller/pagination";

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
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex flex-col gap-1">
          <label htmlFor="dateFrom" className="text-xs font-medium text-zinc-500">
            {t("filterDateFrom")}
          </label>
          <input
            id="dateFrom"
            type="date"
            name="dateFrom"
            defaultValue={params.dateFrom ?? ""}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="dateTo" className="text-xs font-medium text-zinc-500">
            {t("filterDateTo")}
          </label>
          <input
            id="dateTo"
            type="date"
            name="dateTo"
            defaultValue={params.dateTo ?? ""}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="actorUserId" className="text-xs font-medium text-zinc-500">
            {t("filterActor")}
          </label>
          <select
            id="actorUserId"
            name="actorUserId"
            defaultValue={params.actorUserId ?? ""}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700"
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
          <label htmlFor="entityType" className="text-xs font-medium text-zinc-500">
            {t("filterEntityType")}
          </label>
          <select
            id="entityType"
            name="entityType"
            defaultValue={params.entityType ?? ""}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700"
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
          <label htmlFor="action" className="text-xs font-medium text-zinc-500">
            {t("filterAction")}
          </label>
          <select
            id="action"
            name="action"
            defaultValue={params.action ?? ""}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700"
          >
            <option value="">{t("filterActionAll")}</option>
            {facets.actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
          {t("apply")}
        </button>
        <Link href="/seller/audit" className="text-sm underline underline-offset-2">
          {t("reset")}
        </Link>
      </form>

      {result.entries.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnDate")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnActor")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnContext")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnEntity")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnAction")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnField")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnChange")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("columnReason")}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.entries.map((entry) => (
                <tr key={entry.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                  <td className="whitespace-nowrap px-4 py-2">{entry.createdAt.toLocaleString(locale)}</td>
                  <td className="px-4 py-2">{entry.actorName ?? t("systemActor")}</td>
                  <td className="px-4 py-2">{entry.actingContext}</td>
                  <td className="px-4 py-2">
                    <div>{entry.entityType}</div>
                    {entry.entityReference && <div className="text-xs text-zinc-500">{entry.entityReference}</div>}
                  </td>
                  <td className="px-4 py-2">{entry.action}</td>
                  <td className="px-4 py-2">{entry.fieldName ?? "—"}</td>
                  <td className="px-4 py-2">
                    {entry.oldValue || entry.newValue ? (
                      <span>
                        {truncateForDisplay(entry.oldValue) ?? "—"} → {truncateForDisplay(entry.newValue) ?? "—"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">{entry.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
