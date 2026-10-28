import { getLocale, getTranslations } from "next-intl/server";
import { getDiagnosticsReport } from "@/lib/domain/diagnostics/diagnostics-service";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { Alert } from "@/components/ui/alert";

/** Local to this page only - same ok/not-ok meaning as before, now using
 * the --success/--danger tokens instead of literal green/red Tailwind
 * classes so it matches dark mode consistently with the rest of the app. */
function CheckRow({ label, ok, yes, no }: { label: string; ok: boolean; yes: string; no: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-b-0">
      <span className="text-foreground">{label}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}
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
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t("title")} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label={t("appStatus")} value={t("statusOk")} accentBorder />
        <StatTile label={t("environment")} value={report.environment} accentBorder />
        <StatTile label={t("appVersion")} value={report.appVersion} accentBorder />
        <StatTile label={t("gitCommit")} value={report.gitCommit === "unknown" ? t("unknown") : report.gitCommit} accentBorder />
      </div>

      <Card accentBorder className="p-4">
        <h2 className="mb-2 font-semibold text-foreground">{t("database")}</h2>
        {report.database.connected ? (
          <p className="text-sm">
            <span className="font-medium text-success">{t("databaseConnected")}</span>
            <span className="text-muted-foreground"> · {t("latency", { ms: report.database.latencyMs })}</span>
          </p>
        ) : (
          <Alert tone="danger">{t("databaseDisconnected")}</Alert>
        )}
      </Card>

      <Card accentBorder className="p-4">
        <h2 className="mb-2 font-semibold text-foreground">{t("migrations")}</h2>
        {report.migrations.available ? (
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <p>{t("appliedCount", { count: report.migrations.appliedCount })}</p>
            <p>{t("latestMigration", { name: report.migrations.latestMigrationName })}</p>
            {report.migrations.latestAppliedAt && (
              <p>{t("lastAppliedAt", { date: report.migrations.latestAppliedAt.toLocaleString(locale) })}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("migrationsUnavailable")}</p>
        )}
      </Card>

      <Card accentBorder className="p-4">
        <h2 className="mb-2 font-semibold text-foreground">{t("checks")}</h2>
        <CheckRow label={t("databaseUrlConfigured")} ok={report.checks.databaseUrlConfigured} yes={t("yes")} no={t("no")} />
        <CheckRow label={t("authSecretConfigured")} ok={report.checks.authSecretConfigured} yes={t("yes")} no={t("no")} />
      </Card>
    </div>
  );
}
