"use client";

import { useEffect } from "react";
import { captureClientError } from "@/lib/observability/sentry-capture.client";

/**
 * Root-layout error boundary - previously missing entirely (every other
 * error.tsx in this app is scoped under src/app/[locale]/...). Per Next.js
 * convention this replaces the root layout/template when active, so it
 * defines its own <html>/<body> and can't use next-intl - see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    captureClientError(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "2rem", textAlign: "center" }}>
          <h2>Something went wrong</h2>
          {error.digest && <p style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#71717a" }}>{error.digest}</p>}
          <button type="button" onClick={() => retry()} style={{ borderRadius: "0.25rem", background: "black", color: "white", padding: "0.5rem 1rem", fontSize: "0.875rem", fontWeight: 500 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
