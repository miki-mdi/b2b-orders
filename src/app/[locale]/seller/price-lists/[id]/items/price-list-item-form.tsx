"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState, type FormState } from "@/lib/forms/form-state";
import type { Product, ProductUnit, UnitOfMeasure } from "@prisma/client";

type ProductUnitWithRelations = ProductUnit & { product: Product; unitOfMeasure: UnitOfMeasure };

export function PriceListItemForm({
  action,
  productUnits,
  existingPrice,
  existingProductUnitLabel,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  productUnits?: ProductUnitWithRelations[];
  existingPrice?: string;
  existingProductUnitLabel?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);
  const t = useTranslations("seller.priceListItems");
  const tCommon = useTranslations("seller.common");
  const isEditing = existingProductUnitLabel !== undefined;

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4" noValidate>
      {state.status === "error" && state.message && !state.fieldErrors && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </p>
      )}

      {isEditing ? (
        <div>
          <span className="block text-sm font-medium">{t("productUnit")}</span>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{existingProductUnitLabel}</p>
        </div>
      ) : (
        <div>
          <label htmlFor="productUnitId" className="block text-sm font-medium">
            {t("productUnit")}
          </label>
          <select
            id="productUnitId"
            name="productUnitId"
            defaultValue=""
            required
            disabled={!productUnits || productUnits.length === 0}
            aria-invalid={Boolean(state.fieldErrors?.productUnitId)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          >
            <option value="" disabled>
              {t("selectProductUnit")}
            </option>
            {productUnits?.map((productUnit) => (
              <option key={productUnit.id} value={productUnit.id}>
                {productUnit.product.nameEn} - {productUnit.label} ({productUnit.unitOfMeasure.labelEn})
              </option>
            ))}
          </select>
          <FieldError message={state.fieldErrors?.productUnitId} />
        </div>
      )}

      <div>
        <label htmlFor="price" className="block text-sm font-medium">
          {t("price")}
        </label>
        <input
          id="price"
          name="price"
          type="number"
          step="0.01"
          min={0}
          defaultValue={existingPrice ?? ""}
          required
          aria-invalid={Boolean(state.fieldErrors?.price)}
          className="mt-1 w-48 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.price} />
      </div>

      <div>
        <SubmitButton pending={isPending}>{tCommon("save")}</SubmitButton>
      </div>
    </form>
  );
}
