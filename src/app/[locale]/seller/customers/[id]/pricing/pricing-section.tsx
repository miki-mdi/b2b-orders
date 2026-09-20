"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState, type FormState } from "@/lib/forms/form-state";
import type { PriceList } from "@prisma/client";

export function PricingSection({
  assignAction,
  discountAction,
  priceLists,
  currentPriceListId,
  currentDiscountPercent,
  readOnly = false,
}: {
  assignAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  discountAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  priceLists: PriceList[];
  currentPriceListId: string | null;
  currentDiscountPercent: string | null;
  readOnly?: boolean;
}) {
  const [assignState, assignFormAction, assignPending] = useActionState(assignAction, initialFormState);
  const [discountState, discountFormAction, discountPending] = useActionState(discountAction, initialFormState);
  const t = useTranslations("seller.pricing");

  if (readOnly) {
    const assignedPriceList = priceLists.find((priceList) => priceList.id === currentPriceListId);
    return (
      <div className="flex flex-col gap-4 text-sm">
        <div>
          <span className="block font-medium text-zinc-500">{t("assignedPriceList")}</span>
          <p>{assignedPriceList?.name ?? t("noAssignment")}</p>
        </div>
        <div>
          <span className="block font-medium text-zinc-500">{t("discount")}</span>
          <p>{currentDiscountPercent !== null ? `${currentDiscountPercent}%` : "—"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {!currentPriceListId && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {t("noAssignment")}
        </p>
      )}

      <form action={assignFormAction} className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="priceListId" className="block text-sm font-medium">
            {t("assignedPriceList")}
          </label>
          <select
            id="priceListId"
            name="priceListId"
            defaultValue={currentPriceListId ?? ""}
            className="mt-1 w-64 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          >
            <option value="">{t("selectPriceList")}</option>
            {priceLists.map((priceList) => (
              <option key={priceList.id} value={priceList.id}>
                {priceList.name}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton pending={assignPending}>{t("save")}</SubmitButton>
        {assignState.status === "error" && (
          <span role="alert" className="text-sm text-red-600 dark:text-red-400">
            {assignState.message}
          </span>
        )}
      </form>

      <form action={discountFormAction} className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="discountPercent" className="block text-sm font-medium">
            {t("discount")}
          </label>
          <input
            id="discountPercent"
            name="discountPercent"
            type="number"
            step="0.01"
            min={0}
            max={100}
            defaultValue={currentDiscountPercent ?? ""}
            aria-describedby="discountPercent-hint"
            aria-invalid={Boolean(discountState.fieldErrors?.discountPercent)}
            className="mt-1 w-32 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <p id="discountPercent-hint" className="mt-1 text-xs text-zinc-500">
            {t("discountHint")}
          </p>
          <FieldError message={discountState.fieldErrors?.discountPercent} />
        </div>
        <SubmitButton pending={discountPending}>{t("save")}</SubmitButton>
      </form>
    </div>
  );
}
