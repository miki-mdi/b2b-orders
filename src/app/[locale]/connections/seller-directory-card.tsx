"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { initialFormState, type FormState } from "@/lib/forms/form-state";

export function SellerDirectoryCard({
  sellerName,
  status,
  requestAction,
}: {
  sellerName: string;
  /** null means no existing relationship (or one that's DECLINED/REVOKED) - free to request. */
  status: "ACTIVE" | "PENDING" | null;
  requestAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const t = useTranslations("connections");
  const [state, formAction, isPending] = useActionState(requestAction, initialFormState);

  return (
    <Card accentBorder className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-semibold text-foreground">{sellerName}</p>

        {status === "ACTIVE" && (
          <span className="inline-block shrink-0 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
            {t("directoryStatusActive")}
          </span>
        )}
        {status === "PENDING" && (
          <span className="inline-block shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            {t("directoryStatusPending")}
          </span>
        )}
        {status === null && (
          <form action={formAction}>
            <Button type="submit" variant="secondary" disabled={isPending} aria-busy={isPending}>
              {isPending ? "…" : t("requestAction")}
            </Button>
          </form>
        )}
      </div>

      {state.status === "success" && state.message && <Alert tone="success">{state.message}</Alert>}
      {state.status === "error" && state.message && <Alert tone="danger">{state.message}</Alert>}
    </Card>
  );
}
