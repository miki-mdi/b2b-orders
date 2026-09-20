"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
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
    <form action={formAction} className="flex max-w-xl flex-col gap-4" noValidate>
      <p className="rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        {t("limitedEditNotice")}
      </p>

      {state.status === "error" && state.message && !state.fieldErrors && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        <div>
          <span className="block font-medium text-zinc-500">{t("name")}</span>
          <p>{customer.name}</p>
        </div>
        <div>
          <span className="block font-medium text-zinc-500">{t("code")}</span>
          <p className="font-mono">{customer.code ?? "—"}</p>
        </div>
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
            defaultValue={customer.contactEmail ?? ""}
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
            defaultValue={customer.contactPhone ?? ""}
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
          defaultValue={customer.notes ?? ""}
          rows={3}
          aria-invalid={Boolean(state.fieldErrors?.notes)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.notes} />
      </div>

      <div>
        <SubmitButton pending={isPending}>{tCommon("save")}</SubmitButton>
      </div>
    </form>
  );
}
