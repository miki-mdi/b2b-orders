"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FormField, inputStyles } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
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
          <span className="block font-medium text-muted-foreground">{t("assignedPriceList")}</span>
          <p className="text-foreground">{assignedPriceList?.name ?? t("noAssignment")}</p>
        </div>
        <div>
          <span className="block font-medium text-muted-foreground">{t("discount")}</span>
          <p className="text-foreground">{currentDiscountPercent !== null ? `${currentDiscountPercent}%` : "—"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!currentPriceListId && <Alert tone="warning">{t("noAssignment")}</Alert>}

      <form action={assignFormAction} className="flex flex-wrap items-end gap-3">
        <FormField label={t("assignedPriceList")} htmlFor="priceListId">
          <select id="priceListId" name="priceListId" defaultValue={currentPriceListId ?? ""} className={`${inputStyles} sm:w-64`}>
            <option value="">{t("selectPriceList")}</option>
            {priceLists.map((priceList) => (
              <option key={priceList.id} value={priceList.id}>
                {priceList.name}
              </option>
            ))}
          </select>
        </FormField>
        <Button type="submit" disabled={assignPending} aria-busy={assignPending}>
          {assignPending ? "…" : t("save")}
        </Button>
        {assignState.status === "error" && (
          <span role="alert" className="text-sm text-danger">
            {assignState.message}
          </span>
        )}
      </form>

      <form action={discountFormAction} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="discountPercent" className="text-sm font-medium text-foreground">
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
            className={`${inputStyles} sm:w-40`}
          />
          <p id="discountPercent-hint" className="text-xs text-muted-foreground">
            {t("discountHint")}
          </p>
          {discountState.fieldErrors?.discountPercent && (
            <p role="alert" className="text-sm text-danger">
              {discountState.fieldErrors.discountPercent}
            </p>
          )}
        </div>
        <Button type="submit" disabled={discountPending} aria-busy={discountPending}>
          {discountPending ? "…" : t("save")}
        </Button>
      </form>
    </div>
  );
}
