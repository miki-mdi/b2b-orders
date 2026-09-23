"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { captureClientError } from "@/lib/observability/sentry-capture.client";

/**
 * Shared route-segment error boundary (Phase 1E, §7). Reused by
 * seller/buyer/admin's error.tsx files - one component instead of copying
 * the same fallback UI three times.
 *
 * Per this checkout's Next.js version, the error boundary's recovery
 * callback prop is named `retry`, not the `reset` name used in older Next.js
 * versions - see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md.
 *
 * Server Component/Server Action errors already arrive here with a generic,
 * redacted message and a `digest` (Next.js's own production behavior - see
 * that same doc's "error.message" section) - nothing sensitive (a stack
 * trace, a database error, a raw exception message) is ever rendered here.
 * The original error is still available server-side via Next.js's own
 * server log and via this codebase's `logger` at the point each domain
 * function/Server Action already handles its own known failure cases.
 */
export function RouteErrorBoundary({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("common");

  useEffect(() => {
    // Client-side console is the right place for this - see the file
    // header comment for why nothing more sensitive than this ever reaches
    // this component to begin with.
    console.error(error);
    captureClientError(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-xl font-semibold">{t("errorTitle")}</h2>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">{t("errorMessage")}</p>
      {error.digest && <p className="font-mono text-xs text-zinc-400 dark:text-zinc-600">{error.digest}</p>}
      <button
        type="button"
        onClick={retry}
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        {t("retry")}
      </button>
    </div>
  );
}
