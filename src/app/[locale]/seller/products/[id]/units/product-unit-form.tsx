"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState, type FormState } from "@/lib/forms/form-state";
import type { ProductUnit, UnitOfMeasure } from "@prisma/client";

export function ProductUnitForm({
  action,
  productUnit,
  units,
  readOnly = false,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  productUnit?: ProductUnit;
  units: UnitOfMeasure[];
  readOnly?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);
  const t = useTranslations("seller.productUnits");
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

      {units.length === 0 && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {t("noUnitsWarning")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="unitOfMeasureId" className="block text-sm font-medium">
            {t("unitOfMeasure")}
          </label>
          <select
            id="unitOfMeasureId"
            name="unitOfMeasureId"
            defaultValue={productUnit?.unitOfMeasureId ?? ""}
            required
            disabled={units.length === 0}
            aria-invalid={Boolean(state.fieldErrors?.unitOfMeasureId)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          >
            <option value="" disabled>
              {t("selectUnit")}
            </option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.labelEn} ({unit.code})
              </option>
            ))}
          </select>
          <FieldError message={state.fieldErrors?.unitOfMeasureId} />
        </div>

        <div>
          <label htmlFor="sku" className="block text-sm font-medium">
            {t("sku")}
          </label>
          <input
            id="sku"
            name="sku"
            defaultValue={productUnit?.sku}
            required
            aria-invalid={Boolean(state.fieldErrors?.sku)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.sku} />
        </div>
      </div>

      <div>
        <label htmlFor="label" className="block text-sm font-medium">
          {t("label")}
        </label>
        <input
          id="label"
          name="label"
          defaultValue={productUnit?.label}
          required
          aria-describedby="label-hint"
          aria-invalid={Boolean(state.fieldErrors?.label)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <p id="label-hint" className="mt-1 text-xs text-zinc-500">
          {t("labelHint")}
        </p>
        <FieldError message={state.fieldErrors?.label} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="minOrderQty" className="block text-sm font-medium">
            {t("minOrderQty")}
          </label>
          <input
            id="minOrderQty"
            name="minOrderQty"
            type="number"
            step="0.001"
            min={0}
            defaultValue={productUnit?.minOrderQty?.toString() ?? "1"}
            required
            aria-invalid={Boolean(state.fieldErrors?.minOrderQty)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.minOrderQty} />
        </div>

        <div>
          <label htmlFor="orderIncrement" className="block text-sm font-medium">
            {t("orderIncrement")}
          </label>
          <input
            id="orderIncrement"
            name="orderIncrement"
            type="number"
            step="0.001"
            min={0}
            defaultValue={productUnit?.orderIncrement?.toString() ?? "1"}
            required
            aria-invalid={Boolean(state.fieldErrors?.orderIncrement)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.orderIncrement} />
        </div>

        <div>
          <label htmlFor="conversionFactorToBase" className="block text-sm font-medium">
            {t("conversionFactor")}
          </label>
          <input
            id="conversionFactorToBase"
            name="conversionFactorToBase"
            type="number"
            step="0.0001"
            min={0}
            defaultValue={productUnit?.conversionFactorToBase?.toString() ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.conversionFactorToBase)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.conversionFactorToBase} />
        </div>
      </div>

      <div>
        <label htmlFor="barcode" className="block text-sm font-medium">
          {t("barcode")}
        </label>
        <input
          id="barcode"
          name="barcode"
          defaultValue={productUnit?.barcode ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.barcode)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 font-mono dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.barcode} />
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <input
            id="isDefault"
            name="isDefault"
            type="checkbox"
            defaultChecked={productUnit?.isDefault ?? false}
            className="h-4 w-4"
          />
          <label htmlFor="isDefault" className="text-sm font-medium">
            {t("isDefault")}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="isActive"
            name="isActive"
            type="checkbox"
            defaultChecked={productUnit?.isActive ?? true}
            className="h-4 w-4"
          />
          <label htmlFor="isActive" className="text-sm font-medium">
            {tCommon("active")}
          </label>
        </div>
      </div>

      {!readOnly && (
        <div>
          <SubmitButton pending={isPending}>{tCommon("save")}</SubmitButton>
        </div>
      )}
    </form>
  );
}
