"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState, type FormState } from "@/lib/forms/form-state";
import type { PriceList } from "@prisma/client";

export function PriceListForm({
  action,
  priceList,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  priceList?: PriceList;
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);
  const t = useTranslations("seller.priceLists");
  const tCommon = useTranslations("seller.common");

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4" noValidate>
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
            defaultValue={priceList?.name}
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
            defaultValue={priceList?.code ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.code)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.code} />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          {t("description")}
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={priceList?.description ?? ""}
          rows={3}
          aria-invalid={Boolean(state.fieldErrors?.description)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.description} />
      </div>

      <div>
        <label htmlFor="currency" className="block text-sm font-medium">
          {t("currency")}
        </label>
        <input
          id="currency"
          name="currency"
          defaultValue={priceList?.currency ?? "MKD"}
          maxLength={3}
          aria-invalid={Boolean(state.fieldErrors?.currency)}
          className="mt-1 w-32 rounded border border-zinc-300 px-3 py-2 uppercase dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.currency} />
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <input id="isDefault" name="isDefault" type="checkbox" defaultChecked={priceList?.isDefault ?? false} className="h-4 w-4" />
          <label htmlFor="isDefault" className="text-sm font-medium">
            {t("isDefault")}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input id="isActive" name="isActive" type="checkbox" defaultChecked={priceList?.isActive ?? true} className="h-4 w-4" />
          <label htmlFor="isActive" className="text-sm font-medium">
            {tCommon("active")}
          </label>
        </div>
      </div>

      <div>
        <SubmitButton pending={isPending}>{tCommon("save")}</SubmitButton>
      </div>
    </form>
  );
}
