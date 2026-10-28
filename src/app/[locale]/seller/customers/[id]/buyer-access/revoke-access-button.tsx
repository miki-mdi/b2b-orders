"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { initialFormState, type FormState } from "@/lib/forms/form-state";

export function RevokeAccessButton({
  revokeAction,
}: {
  revokeAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const t = useTranslations("seller.buyerAccess");
  const [state, formAction, isPending] = useActionState(revokeAction, initialFormState);
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">{t("revokeConfirmNotice")}</span>
          <form action={formAction}>
            <Button type="submit" variant="danger-outline" disabled={isPending} aria-busy={isPending} className="whitespace-nowrap">
              {isPending ? "…" : t("revokeConfirm")}
            </Button>
          </form>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="whitespace-nowrap"
          >
            {t("revokeCancel")}
          </Button>
        </div>
        {state.status === "error" && state.message && (
          <span role="alert" className="text-xs text-danger">
            {state.message}
          </span>
        )}
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} className="text-sm font-medium text-danger hover:underline">
      {t("revokeAccess")}
    </button>
  );
}
