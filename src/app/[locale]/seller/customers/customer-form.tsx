"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FormField, inputStyles } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { initialFormState, type FormState } from "@/lib/forms/form-state";
import type { Customer } from "@prisma/client";

export function CustomerForm({
  action,
  customer,
  readOnly = false,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  customer?: Customer;
  readOnly?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);
  const t = useTranslations("seller.customers");
  const tCommon = useTranslations("seller.common");

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate inert={readOnly || undefined}>
      {readOnly && (
        <p className="rounded-control border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {tCommon("readOnlyNotice")}
        </p>
      )}
      {state.status === "error" && state.message && !state.fieldErrors && <Alert tone="danger">{state.message}</Alert>}

      {/* Identity/contact/financial fields stay in original DOM order - only
          their grid placement changes. At the xl (wide desktop) breakpoint
          this becomes a 4-col grid: name spans 2 cols so it closes row 1
          with code+taxId (4 cols total), then the remaining 4 fields
          (contactEmail/contactPhone/creditLimit/paymentTermsDays) exactly
          fill row 2 - no field is ever left alone on its own row. Below xl,
          a plain 2-col grid (sm:grid-cols-2) covers tablet and the base
          grid-cols-1 covers mobile, both unchanged from before. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="xl:col-span-2">
          <FormField label={t("name")} htmlFor="name" error={state.fieldErrors?.name}>
            <input
              id="name"
              name="name"
              defaultValue={customer?.name}
              required
              aria-invalid={Boolean(state.fieldErrors?.name)}
              className={inputStyles}
            />
          </FormField>
        </div>

        <FormField label={t("code")} htmlFor="code" error={state.fieldErrors?.code}>
          <input
            id="code"
            name="code"
            defaultValue={customer?.code ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.code)}
            className={`${inputStyles} font-mono`}
          />
        </FormField>

        <FormField label={t("taxId")} htmlFor="taxId" error={state.fieldErrors?.taxId}>
          <input
            id="taxId"
            name="taxId"
            defaultValue={customer?.taxId ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.taxId)}
            className={inputStyles}
          />
        </FormField>

        <FormField label={t("contactEmail")} htmlFor="contactEmail" error={state.fieldErrors?.contactEmail}>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            defaultValue={customer?.contactEmail ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.contactEmail)}
            className={inputStyles}
          />
        </FormField>

        <FormField label={t("contactPhone")} htmlFor="contactPhone" error={state.fieldErrors?.contactPhone}>
          <input
            id="contactPhone"
            name="contactPhone"
            defaultValue={customer?.contactPhone ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.contactPhone)}
            className={inputStyles}
          />
        </FormField>

        <FormField label={t("creditLimit")} htmlFor="creditLimit" error={state.fieldErrors?.creditLimit}>
          <input
            id="creditLimit"
            name="creditLimit"
            type="number"
            step="0.01"
            min={0}
            defaultValue={customer?.creditLimit?.toString() ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.creditLimit)}
            className={inputStyles}
          />
        </FormField>

        <FormField label={t("paymentTermsDays")} htmlFor="paymentTermsDays" error={state.fieldErrors?.paymentTermsDays}>
          <input
            id="paymentTermsDays"
            name="paymentTermsDays"
            type="number"
            min={0}
            defaultValue={customer?.paymentTermsDays ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.paymentTermsDays)}
            className={inputStyles}
          />
        </FormField>
      </div>

      <FormField label={t("notes")} htmlFor="notes" error={state.fieldErrors?.notes}>
        <textarea
          id="notes"
          name="notes"
          defaultValue={customer?.notes ?? ""}
          rows={3}
          aria-invalid={Boolean(state.fieldErrors?.notes)}
          className={inputStyles}
        />
      </FormField>

      <div className="flex items-center gap-2">
        <input id="isActive" name="isActive" type="checkbox" defaultChecked={customer?.isActive ?? true} className="h-4 w-4" />
        <label htmlFor="isActive" className="text-sm font-medium text-foreground">
          {tCommon("active")}
        </label>
      </div>

      {!readOnly && (
        <div>
          <Button type="submit" disabled={isPending} aria-busy={isPending}>
            {isPending ? "…" : tCommon("save")}
          </Button>
        </div>
      )}
    </form>
  );
}
