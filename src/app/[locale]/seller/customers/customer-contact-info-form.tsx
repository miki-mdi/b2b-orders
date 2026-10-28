"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FormField, inputStyles } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { initialFormState, type FormState } from "@/lib/forms/form-state";
import type { Customer } from "@prisma/client";

/**
 * Sales Rep's "limited edit" of a customer (Phase 1F-B1) - contactEmail/
 * contactPhone/notes only, a separate component from the full CustomerForm
 * rather than that form with fields disabled, so a Sales Rep never even sees
 * the code/name/credit-limit/active-status fields they can't change. The
 * server-side enforcement this mirrors is updateCustomerContactInfo
 * (src/lib/domain/customers/customer-service.ts), which writes only these
 * three columns regardless of what's posted.
 */
export function CustomerContactInfoForm({
  action,
  customer,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  customer: Customer;
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);
  const t = useTranslations("seller.customers");
  const tCommon = useTranslations("seller.common");

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <p className="rounded-control border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        {t("limitedEditNotice")}
      </p>

      {state.status === "error" && state.message && !state.fieldErrors && <Alert tone="danger">{state.message}</Alert>}

      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <span className="block font-medium text-muted-foreground">{t("name")}</span>
          <p className="text-foreground">{customer.name}</p>
        </div>
        <div>
          <span className="block font-medium text-muted-foreground">{t("code")}</span>
          <p className="font-mono text-foreground">{customer.code ?? "—"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t("contactEmail")} htmlFor="contactEmail" error={state.fieldErrors?.contactEmail}>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            defaultValue={customer.contactEmail ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.contactEmail)}
            className={inputStyles}
          />
        </FormField>

        <FormField label={t("contactPhone")} htmlFor="contactPhone" error={state.fieldErrors?.contactPhone}>
          <input
            id="contactPhone"
            name="contactPhone"
            defaultValue={customer.contactPhone ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.contactPhone)}
            className={inputStyles}
          />
        </FormField>
      </div>

      <FormField label={t("notes")} htmlFor="notes" error={state.fieldErrors?.notes}>
        <textarea
          id="notes"
          name="notes"
          defaultValue={customer.notes ?? ""}
          rows={3}
          aria-invalid={Boolean(state.fieldErrors?.notes)}
          className={inputStyles}
        />
      </FormField>

      <div>
        <Button type="submit" disabled={isPending} aria-busy={isPending}>
          {isPending ? "…" : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
