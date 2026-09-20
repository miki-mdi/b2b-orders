"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ImportType } from "@/lib/domain/import/types";
import { confirmImportAction, previewImportAction, type ImportActionResult } from "./actions";

const STATUS_STYLES: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  NO_CHANGE: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  ERROR: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

function downloadCsv(csv: string, fileName: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ImportWizard({ importType, templateHeaders }: { importType: ImportType; templateHeaders: string[] }) {
  const t = useTranslations("seller.imports");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportActionResult | null>(null);
  const [confirmResult, setConfirmResult] = useState<ImportActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setConfirmResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setPreview(null);
    setConfirmResult(null);
  }

  function handlePreview() {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await previewImportAction(importType, formData);
      setPreview(result);
      setConfirmResult(null);
    });
  }

  function handleConfirm() {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await confirmImportAction(importType, formData);
      setConfirmResult(result);
    });
  }

  // Once confirmed, the result view replaces the wizard entirely - a
  // second confirm click can never re-run against a stale File, and the
  // success message is never ambiguous about partial failure (§12).
  if (confirmResult?.status === "confirmed") {
    const { summary, rows, malformedRows, resultCsv } = confirmResult.result;
    const hasRejected = summary.rejected > 0;
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        <div
          role="status"
          className={`rounded border px-4 py-3 text-sm ${
            hasRejected
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
              : "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
          }`}
        >
          {hasRejected ? t("resultPartial", { rejected: summary.rejected }) : t("resultSuccess")}
        </div>

        <SummaryGrid t={t} summary={summary} />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadCsv(resultCsv, `${importType}-import-result.csv`)}
            className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {t("downloadResult")}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            {t("importAnother")}
          </button>
          <Link
            href="/seller/imports"
            className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {t("backToList")}
          </Link>
        </div>

        <RowsTable t={t} rows={rows} malformedRows={malformedRows} />
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("expectedColumns")}</p>
        <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-500">{templateHeaders.join(", ")}</p>
      </div>

      <div>
        <label htmlFor="file" className="block text-sm font-medium">
          {t("chooseFile")}
        </label>
        <input
          ref={fileInputRef}
          id="file"
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="mt-1 block w-full text-sm"
        />
      </div>

      {preview?.status === "error" && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {preview.message}
        </p>
      )}
      {confirmResult?.status === "error" && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {confirmResult.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handlePreview}
          disabled={!file || isPending}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
        >
          {isPending ? t("working") : t("preview")}
        </button>
      </div>

      {preview?.status === "preview" && (
        <>
          <SummaryGrid t={t} summary={preview.preview.summary} />

          {preview.preview.summary.rejected > 0 && (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {t("previewRejectedWarning", { rejected: preview.preview.summary.rejected })}
            </p>
          )}

          {preview.preview.summary.created + preview.preview.summary.updated > 0 ? (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="w-fit rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
            >
              {isPending
                ? t("working")
                : t("confirmImportCount", { count: preview.preview.summary.created + preview.preview.summary.updated })}
            </button>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-500">{t("nothingToImport")}</p>
          )}

          <RowsTable t={t} rows={preview.preview.rows} malformedRows={preview.preview.malformedRows} />
        </>
      )}
    </div>
  );
}

function SummaryGrid({
  t,
  summary,
}: {
  t: ReturnType<typeof useTranslations>;
  summary: { totalRows: number; created: number; updated: number; unchanged: number; rejected: number };
}) {
  const items = [
    { label: t("totalRows"), value: summary.totalRows },
    { label: t("created"), value: summary.created },
    { label: t("updated"), value: summary.updated },
    { label: t("unchanged"), value: summary.unchanged },
    { label: t("rejected"), value: summary.rejected },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="rounded border border-zinc-200 p-3 text-center dark:border-zinc-800">
          <p className="text-xl font-semibold">{item.value}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function RowsTable({
  t,
  rows,
  malformedRows,
}: {
  t: ReturnType<typeof useTranslations>;
  rows: { row: number; status: string; key: string; errors: { message: string }[]; warnings: string[]; changedFields?: string[] }[];
  malformedRows: { row: number; message: string }[];
}) {
  if (rows.length === 0 && malformedRows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-900">
          <tr>
            <th className="px-3 py-2 font-medium">{t("columnRow")}</th>
            <th className="px-3 py-2 font-medium">{t("columnStatus")}</th>
            <th className="px-3 py-2 font-medium">{t("columnKey")}</th>
            <th className="px-3 py-2 font-medium">{t("columnDetails")}</th>
          </tr>
        </thead>
        <tbody>
          {malformedRows.map((m) => (
            <tr key={`m-${m.row}`} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="px-3 py-2">{m.row}</td>
              <td className="px-3 py-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES.ERROR}`}>{t("statusError")}</span>
              </td>
              <td className="px-3 py-2 text-zinc-500">—</td>
              <td className="px-3 py-2 text-red-700 dark:text-red-400">{m.message}</td>
            </tr>
          ))}
          {rows.map((r) => (
            <tr key={r.row} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="px-3 py-2">{r.row}</td>
              <td className="px-3 py-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status] ?? ""}`}>
                  {t(`status${r.status === "NO_CHANGE" ? "NoChange" : r.status.charAt(0) + r.status.slice(1).toLowerCase()}`)}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.key}</td>
              <td className="px-3 py-2">
                {r.errors.length > 0 && (
                  <span className="text-red-700 dark:text-red-400">{r.errors.map((e) => e.message).join("; ")}</span>
                )}
                {r.warnings.length > 0 && <span className="text-amber-700 dark:text-amber-400">{r.warnings.join("; ")}</span>}
                {r.changedFields && r.changedFields.length > 0 && (
                  <span className="text-zinc-500 dark:text-zinc-500">{r.changedFields.join(", ")}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
