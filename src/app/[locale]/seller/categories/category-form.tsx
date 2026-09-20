"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState, type FormState } from "@/lib/forms/form-state";
import type { Category } from "@prisma/client";

export function CategoryForm({
  action,
  category,
  readOnly = false,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  category?: Category;
  readOnly?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);
  const t = useTranslations("seller.categories");
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
        <label htmlFor="nameMk" className="block text-sm font-medium">
          {t("nameMk")}
        </label>
        <input
          id="nameMk"
          name="nameMk"
          defaultValue={category?.nameMk}
          required
          aria-invalid={Boolean(state.fieldErrors?.nameMk)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.nameMk} />
      </div>

      <div>
        <label htmlFor="nameEn" className="block text-sm font-medium">
          {t("nameEn")}
        </label>
        <input
          id="nameEn"
          name="nameEn"
          defaultValue={category?.nameEn}
          required
          aria-invalid={Boolean(state.fieldErrors?.nameEn)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.nameEn} />
      </div>

      <div>
        <label htmlFor="code" className="block text-sm font-medium">
          {t("code")}
        </label>
        <input
          id="code"
          name="code"
          defaultValue={category?.code ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.code)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.code} />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          {t("description")}
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={category?.description ?? ""}
          rows={3}
          aria-invalid={Boolean(state.fieldErrors?.description)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.description} />
      </div>

      <div>
        <label htmlFor="sortOrder" className="block text-sm font-medium">
          {t("sortOrder")}
        </label>
        <input
          id="sortOrder"
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={category?.sortOrder ?? 0}
          aria-invalid={Boolean(state.fieldErrors?.sortOrder)}
          className="mt-1 w-32 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.sortOrder} />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="isActive"
          name="isActive"
          type="checkbox"
          defaultChecked={category?.isActive ?? true}
          className="h-4 w-4"
        />
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
