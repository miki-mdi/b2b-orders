"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FormField, inputStyles } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { initialFormState, type FormState } from "@/lib/forms/form-state";

export function BuyerAccessForm({
  action,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);
  const t = useTranslations("seller.buyerAccess");

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      {state.status === "success" && state.message && <Alert tone="success">{state.message}</Alert>}
      {state.status === "error" && state.message && !state.fieldErrors && <Alert tone="danger">{state.message}</Alert>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <FormField label={t("emailLabel")} htmlFor="buyer-access-email" error={state.fieldErrors?.email}>
            <input
              id="buyer-access-email"
              name="email"
              type="email"
              required
              aria-invalid={Boolean(state.fieldErrors?.email)}
              className={inputStyles}
            />
          </FormField>
        </div>
        <Button type="submit" disabled={isPending} aria-busy={isPending} className="shrink-0">
          {isPending ? "…" : t("sendButton")}
        </Button>
      </div>
    </form>
  );
}
