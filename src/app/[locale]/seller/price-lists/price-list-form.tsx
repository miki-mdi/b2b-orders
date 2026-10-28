"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FormField, inputStyles } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { initialFormState, type FormState } from "@/lib/forms/form-state";

/**
 * Deliberately narrower than Prisma's PriceList model (and NOT the result of
 * getPriceList(), which also includes items/productUnit/product - all
 * carrying Decimal fields). A Server Component passing that full result into
 * this Client Component would fail at runtime ("Only plain objects can be
 * passed to Client Components... Decimal objects are not supported"), even
 * though it type-checks fine today - Decimal isn't a plain object, and nested
 * relations aren't needed here anyway. Callers must build this plain object
 * explicitly from only the fields the form actually edits.
 */
export type PriceListFormValues = {
  name: string;
  code: string | null;
  description: string | null;
  currency: string;
  isDefault: boolean;
  isActive: boolean;
};

export function PriceListForm({
  action,
  priceList,
  readOnly = false,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  priceList?: PriceListFormValues;
  readOnly?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);
  const t = useTranslations("seller.priceLists");
  const tCommon = useTranslations("seller.common");

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate inert={readOnly || undefined}>
      {readOnly && (
        <p className="rounded-control border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {tCommon("readOnlyNotice")}
        </p>
      )}
      {state.status === "error" && state.message && !state.fieldErrors && <Alert tone="danger">{state.message}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t("name")} htmlFor="name" error={state.fieldErrors?.name}>
          <input
            id="name"
            name="name"
            defaultValue={priceList?.name}
            required
            aria-invalid={Boolean(state.fieldErrors?.name)}
            className={inputStyles}
          />
        </FormField>

        <FormField label={t("code")} htmlFor="code" error={state.fieldErrors?.code}>
          <input
            id="code"
            name="code"
            defaultValue={priceList?.code ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.code)}
            className={`${inputStyles} font-mono`}
          />
        </FormField>
      </div>

      <FormField label={t("description")} htmlFor="description" error={state.fieldErrors?.description}>
        <textarea
          id="description"
          name="description"
          defaultValue={priceList?.description ?? ""}
          rows={2}
          aria-invalid={Boolean(state.fieldErrors?.description)}
          className={inputStyles}
        />
      </FormField>

      {/* Currency, both checkboxes, and Save share one row on desktop - Save
          moved up from its own block below (same DOM/tab position, right
          after isActive) purely so the row wraps as one compact unit. */}
      <div className="flex flex-wrap items-end gap-4">
        <FormField label={t("currency")} htmlFor="currency" error={state.fieldErrors?.currency}>
          <input
            id="currency"
            name="currency"
            defaultValue={priceList?.currency ?? "MKD"}
            maxLength={3}
            aria-invalid={Boolean(state.fieldErrors?.currency)}
            className={`${inputStyles} w-24 uppercase`}
          />
        </FormField>

        <div className="flex items-center gap-2 pb-2">
          <input id="isDefault" name="isDefault" type="checkbox" defaultChecked={priceList?.isDefault ?? false} className="h-4 w-4" />
          <label htmlFor="isDefault" className="text-sm font-medium text-foreground">
            {t("isDefault")}
          </label>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <input id="isActive" name="isActive" type="checkbox" defaultChecked={priceList?.isActive ?? true} className="h-4 w-4" />
          <label htmlFor="isActive" className="text-sm font-medium text-foreground">
            {tCommon("active")}
          </label>
        </div>

        {!readOnly && (
          <Button type="submit" disabled={isPending} aria-busy={isPending}>
            {isPending ? "…" : tCommon("save")}
          </Button>
        )}
      </div>
    </form>
  );
}
