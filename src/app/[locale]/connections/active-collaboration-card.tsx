"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { initialFormState, type FormState } from "@/lib/forms/form-state";

export function ActiveCollaborationCard({
  sellerName,
  customerName,
  revokeAction,
}: {
  sellerName: string;
  customerName: string;
  revokeAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const t = useTranslations("connections");
  const [state, formAction, isPending] = useActionState(revokeAction, initialFormState);
  const [confirming, setConfirming] = useState(false);

  return (
    <Card accentBorder className="flex flex-col gap-3 p-4">
      <div>
        <p className="text-base font-semibold text-foreground">{sellerName}</p>
        <p className="text-sm text-muted-foreground">{t("asCustomer", { name: customerName })}</p>
      </div>

      {state.status === "success" && state.message && <Alert tone="success">{state.message}</Alert>}
      {state.status === "error" && state.message && <Alert tone="danger">{state.message}</Alert>}

      {confirming ? (
        <div className="flex flex-col gap-2">
          <Alert tone="warning">{t("revokeConfirmNotice")}</Alert>
          <div className="flex flex-wrap gap-3">
            <form action={formAction}>
              <Button type="submit" variant="danger-outline" disabled={isPending} aria-busy={isPending}>
                {isPending ? "…" : t("revokeConfirm")}
              </Button>
            </form>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={isPending}>
              {t("revokeCancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" variant="danger-outline" onClick={() => setConfirming(true)}>
            {t("endCollaboration")}
          </Button>
        </div>
      )}
    </Card>
  );
}
