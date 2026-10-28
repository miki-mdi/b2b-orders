"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { initialFormState, type FormState } from "@/lib/forms/form-state";

export function InvitationCard({
  sellerName,
  customerName,
  acceptAction,
  declineAction,
}: {
  sellerName: string;
  customerName: string | null;
  acceptAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  declineAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const t = useTranslations("connections");
  const [acceptState, acceptFormAction, isAccepting] = useActionState(acceptAction, initialFormState);
  const [declineState, declineFormAction, isDeclining] = useActionState(declineAction, initialFormState);

  // Only one of the two forms on this card can ever have a non-idle state
  // at a time (accepting and declining the same invitation are mutually
  // exclusive user actions), so showing whichever one just changed is
  // unambiguous.
  const state = acceptState.status !== "idle" ? acceptState : declineState;
  const busy = isAccepting || isDeclining;

  return (
    <Card accentBorder className="flex flex-col gap-3 p-4">
      <div>
        <p className="text-base font-semibold text-foreground">{sellerName}</p>
        {customerName && <p className="text-sm text-muted-foreground">{t("asCustomer", { name: customerName })}</p>}
      </div>

      {state.status === "success" && state.message && <Alert tone="success">{state.message}</Alert>}
      {state.status === "error" && state.message && <Alert tone="danger">{state.message}</Alert>}

      <div className="flex gap-3">
        <form action={acceptFormAction}>
          <Button type="submit" variant="primary" disabled={busy} aria-busy={isAccepting}>
            {isAccepting ? "…" : t("accept")}
          </Button>
        </form>
        <form action={declineFormAction}>
          <Button type="submit" variant="secondary" disabled={busy} aria-busy={isDeclining}>
            {isDeclining ? "…" : t("decline")}
          </Button>
        </form>
      </div>
    </Card>
  );
}
