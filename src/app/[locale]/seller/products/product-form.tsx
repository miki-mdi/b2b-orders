"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState, type FormState } from "@/lib/forms/form-state";
import type { Category, Product } from "@prisma/client";

export function ProductForm({
  action,
  product,
  categories,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  product?: Product;
  categories: Category[];
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);
  const t = useTranslations("seller.products");
  const tCommon = useTranslations("seller.common");

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4" noValidate>
      {state.status === "error" && state.message && !state.fieldErrors && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </p>
      )}

      {categories.length === 0 && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {t("noCategoriesWarning")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nameMk" className="block text-sm font-medium">
            {t("nameMk")}
          </label>
          <input
            id="nameMk"
            name="nameMk"
            defaultValue={product?.nameMk}
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
            defaultValue={product?.nameEn}
            required
            aria-invalid={Boolean(state.fieldErrors?.nameEn)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.nameEn} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sku" className="block text-sm font-medium">
            {t("sku")}
          </label>
          <input
            id="sku"
            name="sku"
            defaultValue={product?.sku}
            required
            aria-invalid={Boolean(state.fieldErrors?.sku)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.sku} />
        </div>

        <div>
          <label htmlFor="categoryId" className="block text-sm font-medium">
            {t("category")}
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={product?.categoryId ?? ""}
            required
            disabled={categories.length === 0}
            aria-invalid={Boolean(state.fieldErrors?.categoryId)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
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
          <FieldError message={state.fieldErrors?.categoryId} />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          {t("description")}
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={product?.description ?? ""}
          rows={3}
          aria-invalid={Boolean(state.fieldErrors?.description)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.description} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="barcode" className="block text-sm font-medium">
            {t("barcode")}
          </label>
          <input
            id="barcode"
            name="barcode"
            defaultValue={product?.barcode ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.barcode)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.barcode} />
        </div>

        <div>
          <label htmlFor="defaultVatRate" className="block text-sm font-medium">
            {t("vatRate")}
          </label>
          <input
            id="defaultVatRate"
            name="defaultVatRate"
            type="number"
            step="0.01"
            min={0}
            max={100}
            defaultValue={product?.defaultVatRate?.toString() ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.defaultVatRate)}
            aria-describedby="defaultVatRate-hint"
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <p id="defaultVatRate-hint" className="mt-1 text-xs text-zinc-500">
            {t("vatRateHint")}
          </p>
          <FieldError message={state.fieldErrors?.defaultVatRate} />
        </div>
      </div>

      <div>
        <label htmlFor="imageUrl" className="block text-sm font-medium">
          {t("imageUrl")}
        </label>
        <input
          id="imageUrl"
          name="imageUrl"
          type="url"
          defaultValue={product?.imageUrl ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.imageUrl)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.imageUrl} />
      </div>

      <div className="flex items-center gap-2">
        <input id="isActive" name="isActive" type="checkbox" defaultChecked={product?.isActive ?? true} className="h-4 w-4" />
        <label htmlFor="isActive" className="text-sm font-medium">
          {tCommon("active")}
        </label>
      </div>

      <div>
        <SubmitButton pending={isPending}>{tCommon("save")}</SubmitButton>
      </div>
    </form>
  );
}
