"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FormField, inputStyles } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { initialFormState, type FormState } from "@/lib/forms/form-state";
import type { Category } from "@prisma/client";

/**
 * Deliberately narrower than Prisma's Product model (and NOT the result of
 * getProduct(), which also includes the `units` relation - each unit
 * carrying Decimal fields like minOrderQty/orderIncrement). A Server
 * Component passing that full result into this Client Component fails at
 * runtime ("Only plain objects can be passed to Client Components...
 * Decimal objects are not supported"), even though it type-checks fine today
 * - Decimal isn't a plain object, and the units relation isn't needed here
 * anyway (same bug class as PriceListFormValues in price-list-form.tsx).
 * Callers must build this plain object explicitly from only the fields the
 * form actually edits, pre-converting defaultVatRate to a string.
 */
export type ProductFormValues = {
  nameMk: string;
  nameEn: string;
  sku: string;
  categoryId: string | null;
  barcode: string | null;
  defaultVatRate: string | null;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
};

export function ProductForm({
  action,
  product,
  categories,
  readOnly = false,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  product?: ProductFormValues;
  categories: Category[];
  readOnly?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);
  const t = useTranslations("seller.products");
  const tCommon = useTranslations("seller.common");

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate inert={readOnly || undefined}>
      {readOnly && (
        <p className="rounded-control border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {tCommon("readOnlyNotice")}
        </p>
      )}
      {state.status === "error" && state.message && !state.fieldErrors && <Alert tone="danger">{state.message}</Alert>}

      {categories.length === 0 && <Alert tone="warning">{t("noCategoriesWarning")}</Alert>}

      {/* Name pair stays adjacent (cols 1-2 of row 1 at every width); SKU
          joins them on desktop, then Category/Barcode/VAT follow directly
          after on row 2 - same logical grouping as before, just laid out
          as one 3-col grid instead of three separate 2-col ones so desktop
          shows all six fields in two rows instead of three. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label={t("nameMk")} htmlFor="nameMk" error={state.fieldErrors?.nameMk}>
          <input
            id="nameMk"
            name="nameMk"
            defaultValue={product?.nameMk}
            required
            aria-invalid={Boolean(state.fieldErrors?.nameMk)}
            className={inputStyles}
          />
        </FormField>

        <FormField label={t("nameEn")} htmlFor="nameEn" error={state.fieldErrors?.nameEn}>
          <input
            id="nameEn"
            name="nameEn"
            defaultValue={product?.nameEn}
            required
            aria-invalid={Boolean(state.fieldErrors?.nameEn)}
            className={inputStyles}
          />
        </FormField>

        <FormField label={t("sku")} htmlFor="sku" error={state.fieldErrors?.sku}>
          <input
            id="sku"
            name="sku"
            defaultValue={product?.sku}
            required
            aria-invalid={Boolean(state.fieldErrors?.sku)}
            className={`${inputStyles} font-mono`}
          />
        </FormField>

        <FormField label={t("category")} htmlFor="categoryId" error={state.fieldErrors?.categoryId}>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={product?.categoryId ?? ""}
            required
            disabled={categories.length === 0}
            aria-invalid={Boolean(state.fieldErrors?.categoryId)}
            className={inputStyles}
          >
            <option value="" disabled>
              {t("selectCategory")}
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.nameEn}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label={t("barcode")} htmlFor="barcode" error={state.fieldErrors?.barcode}>
          <input
            id="barcode"
            name="barcode"
            defaultValue={product?.barcode ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.barcode)}
            className={`${inputStyles} font-mono`}
          />
        </FormField>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="defaultVatRate" className="text-sm font-medium text-foreground">
            {t("vatRate")}
          </label>
          <input
            id="defaultVatRate"
            name="defaultVatRate"
            type="number"
            step="0.01"
            min={0}
            max={100}
            defaultValue={product?.defaultVatRate ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.defaultVatRate)}
            aria-describedby="defaultVatRate-hint"
            className={inputStyles}
          />
          <p id="defaultVatRate-hint" className="text-xs text-muted-foreground">
            {t("vatRateHint")}
          </p>
          {state.fieldErrors?.defaultVatRate && (
            <p role="alert" className="text-sm text-danger">
              {state.fieldErrors.defaultVatRate}
            </p>
          )}
        </div>
      </div>

      <FormField label={t("description")} htmlFor="description" error={state.fieldErrors?.description}>
        <textarea
          id="description"
          name="description"
          defaultValue={product?.description ?? ""}
          rows={3}
          aria-invalid={Boolean(state.fieldErrors?.description)}
          className={inputStyles}
        />
      </FormField>

      <FormField label={t("imageUrl")} htmlFor="imageUrl" error={state.fieldErrors?.imageUrl}>
        <input
          id="imageUrl"
          name="imageUrl"
          type="url"
          defaultValue={product?.imageUrl ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.imageUrl)}
          className={inputStyles}
        />
      </FormField>

      <div className="flex items-center gap-2">
        <input id="isActive" name="isActive" type="checkbox" defaultChecked={product?.isActive ?? true} className="h-4 w-4" />
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
