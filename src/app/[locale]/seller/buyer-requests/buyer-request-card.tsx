"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FormField, inputStyles } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { initialFormState, type FormState } from "@/lib/forms/form-state";

export function BuyerRequestCard({
  relationshipId,
  buyerName,
  buyerEmail,
  customers,
  acceptAction,
  declineAction,
}: {
  relationshipId: string;
  buyerName: string;
  buyerEmail: string;
  customers: { id: string; name: string }[];
  acceptAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  declineAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const t = useTranslations("seller.buyerRequests");
  const [acceptState, acceptFormAction, isAccepting] = useActionState(acceptAction, initialFormState);
  const [declineState, declineFormAction, isDeclining] = useActionState(declineAction, initialFormState);

  // Only one of the two forms on this card can ever have a non-idle state
  // at a time (accepting and declining the same request are mutually
  // exclusive user actions), so showing whichever one just changed is
  // unambiguous.
  const state = acceptState.status !== "idle" ? acceptState : declineState;
  const busy = isAccepting || isDeclining;
  const selectId = `buyer-request-customer-${relationshipId}`;

  return (
    <Card accentBorder className="flex flex-col gap-3 p-4">
      <div>
        <p className="text-base font-semibold text-foreground">{buyerName}</p>
        <p className="text-sm text-muted-foreground">{buyerEmail}</p>
        <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          {t("statusPending")}
        </span>
      </div>

      {state.status === "success" && state.message && <Alert tone="success">{state.message}</Alert>}
      {state.status === "error" && state.message && <Alert tone="danger">{state.message}</Alert>}

      <form action={acceptFormAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <FormField label={t("customerLabel")} htmlFor={selectId}>
            <select
              id={selectId}
              name="customerId"
              required
              disabled={customers.length === 0}
              defaultValue=""
              className={inputStyles}
            >
              <option value="" disabled>
                {t("customerPlaceholder")}
              </option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <Button type="submit" variant="primary" disabled={busy || customers.length === 0} aria-busy={isAccepting} className="shrink-0">
          {isAccepting ? "…" : t("accept")}
        </Button>
      </form>

      <form action={declineFormAction}>
        <Button type="submit" variant="danger" disabled={busy} aria-busy={isDeclining}>
          {isDeclining ? "…" : t("decline")}
        </Button>
      </form>
    </Card>
  );
}
