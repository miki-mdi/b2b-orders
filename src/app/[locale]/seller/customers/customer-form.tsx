"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
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
    <form action={formAction} className="flex max-w-xl flex-col gap-4" noValidate inert={readOnly || undefined}>
      {readOnly && (
        <p className="rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          {tCommon("readOnlyNotice")}
        </p>
      )}
      {state.status === "error" && state.message && !state.fieldErrors && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            {t("name")}
          </label>
          <input
            id="name"
            name="name"
            defaultValue={customer?.name}
            required
            aria-invalid={Boolean(state.fieldErrors?.name)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.name} />
        </div>

        <div>
          <label htmlFor="code" className="block text-sm font-medium">
            {t("code")}
          </label>
          <input
            id="code"
            name="code"
            defaultValue={customer?.code ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.code)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.code} />
        </div>
      </div>

      <div>
        <label htmlFor="taxId" className="block text-sm font-medium">
          {t("taxId")}
        </label>
        <input
          id="taxId"
          name="taxId"
          defaultValue={customer?.taxId ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.taxId)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.taxId} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contactEmail" className="block text-sm font-medium">
            {t("contactEmail")}
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            defaultValue={customer?.contactEmail ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.contactEmail)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.contactEmail} />
        </div>
        <div>
          <label htmlFor="contactPhone" className="block text-sm font-medium">
            {t("contactPhone")}
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            defaultValue={customer?.contactPhone ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.contactPhone)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.contactPhone} />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium">
          {t("notes")}
        </label>
        <textarea
          id="notes"
          name="notes"
          defaultValue={customer?.notes ?? ""}
          rows={3}
          aria-invalid={Boolean(state.fieldErrors?.notes)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.notes} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="creditLimit" className="block text-sm font-medium">
            {t("creditLimit")}
          </label>
          <input
            id="creditLimit"
            name="creditLimit"
            type="number"
            step="0.01"
            min={0}
            defaultValue={customer?.creditLimit?.toString() ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.creditLimit)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.creditLimit} />
        </div>
        <div>
          <label htmlFor="paymentTermsDays" className="block text-sm font-medium">
            {t("paymentTermsDays")}
          </label>
          <input
            id="paymentTermsDays"
            name="paymentTermsDays"
            type="number"
            min={0}
            defaultValue={customer?.paymentTermsDays ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.paymentTermsDays)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.paymentTermsDays} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input id="isActive" name="isActive" type="checkbox" defaultChecked={customer?.isActive ?? true} className="h-4 w-4" />
        <label htmlFor="isActive" className="text-sm font-medium">
          {tCommon("active")}
        </label>
      </div>

      {!readOnly && (
        <div>
          <SubmitButton pending={isPending}>{tCommon("save")}</SubmitButton>
        </div>
      )}
    </form>
  );
}
