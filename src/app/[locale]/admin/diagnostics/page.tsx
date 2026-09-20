import { getLocale, getTranslations } from "next-intl/server";
import { getDiagnosticsReport } from "@/lib/domain/diagnostics/diagnostics-service";

function CheckRow({ label, ok, yes, no }: { label: string; ok: boolean; yes: string; no: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 py-2 text-sm last:border-b-0 dark:border-zinc-900">
      <span>{label}</span>
      <span
        className={
          "rounded-full px-2 py-0.5 text-xs font-medium " +
          (ok
            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200")
        }
      >
        {ok ? yes : no}
      </span>
    </div>
  );
}

export default async function DiagnosticsPage() {
  const t = await getTranslations("admin.diagnostics");
  const locale = await getLocale();
  const report = await getDiagnosticsReport();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-zinc-500">{t("appStatus")}</dt>
          <dd>{t("statusOk")}</dd>
          <dt className="text-zinc-500">{t("environment")}</dt>
          <dd>{report.environment}</dd>
          <dt className="text-zinc-500">{t("appVersion")}</dt>
          <dd>{report.appVersion}</dd>
          <dt className="text-zinc-500">{t("gitCommit")}</dt>
          <dd className="font-mono">{report.gitCommit === "unknown" ? t("unknown") : report.gitCommit}</dd>
        </dl>
      </div>

      <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-2 font-semibold">{t("database")}</h2>
        <p className="text-sm">
          {report.database.connected ? (
            <>
              <span className="text-green-700 dark:text-green-400">{t("databaseConnected")}</span>
              {" · "}
              {t("latency", { ms: report.database.latencyMs })}
            </>
          ) : (
            <span className="text-red-700 dark:text-red-400">{t("databaseDisconnected")}</span>
          )}
        </p>
      </div>

      <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-2 font-semibold">{t("migrations")}</h2>
        {report.migrations.available ? (
          <div className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
            <p>{t("appliedCount", { count: report.migrations.appliedCount })}</p>
            <p>{t("latestMigration", { name: report.migrations.latestMigrationName })}</p>
            {report.migrations.latestAppliedAt && (
              <p>{t("lastAppliedAt", { date: report.migrations.latestAppliedAt.toLocaleString(locale) })}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{t("migrationsUnavailable")}</p>
        )}
      </div>

      <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-2 font-semibold">{t("checks")}</h2>
        <CheckRow label={t("databaseUrlConfigured")} ok={report.checks.databaseUrlConfigured} yes={t("yes")} no={t("no")} />
        <CheckRow label={t("authSecretConfigured")} ok={report.checks.authSecretConfigured} yes={t("yes")} no={t("no")} />
      </div>
    </div>
  );
}
