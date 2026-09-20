"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState, type FormState } from "@/lib/forms/form-state";
import type { UnitOfMeasure } from "@prisma/client";

export function UnitForm({
  action,
  unit,
  readOnly = false,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  unit?: UnitOfMeasure;
  readOnly?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);
  const t = useTranslations("seller.units");
  const tCommon = useTranslations("seller.common");

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4" noValidate inert={readOnly || undefined}>
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

      <div>
        <label htmlFor="code" className="block text-sm font-medium">
          {t("code")}
        </label>
        <input
          id="code"
          name="code"
          defaultValue={unit?.code}
          required
          maxLength={10}
          aria-invalid={Boolean(state.fieldErrors?.code)}
          className="mt-1 w-40 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.code} />
      </div>

      <div>
        <label htmlFor="labelMk" className="block text-sm font-medium">
          {t("labelMk")}
        </label>
        <input
          id="labelMk"
          name="labelMk"
          defaultValue={unit?.labelMk}
          required
          aria-invalid={Boolean(state.fieldErrors?.labelMk)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.labelMk} />
      </div>

      <div>
        <label htmlFor="labelEn" className="block text-sm font-medium">
          {t("labelEn")}
        </label>
        <input
          id="labelEn"
          name="labelEn"
          defaultValue={unit?.labelEn}
          required
          aria-invalid={Boolean(state.fieldErrors?.labelEn)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.labelEn} />
      </div>

      <div className="flex items-center gap-2">
        <input id="isActive" name="isActive" type="checkbox" defaultChecked={unit?.isActive ?? true} className="h-4 w-4" />
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
