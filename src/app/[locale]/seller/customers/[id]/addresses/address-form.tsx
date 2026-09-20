"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState, type FormState } from "@/lib/forms/form-state";
import type { CustomerAddress } from "@prisma/client";

export function AddressForm({
  action,
  address,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  address?: CustomerAddress;
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);
  const t = useTranslations("seller.addresses");
  const tCommon = useTranslations("seller.common");

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4" noValidate>
      {state.status === "error" && state.message && !state.fieldErrors && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="label" className="block text-sm font-medium">
            {t("label")}
          </label>
          <input
            id="label"
            name="label"
            defaultValue={address?.label}
            required
            aria-invalid={Boolean(state.fieldErrors?.label)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.label} />
        </div>
        <div>
          <label htmlFor="recipientName" className="block text-sm font-medium">
            {t("recipientName")}
          </label>
          <input
            id="recipientName"
            name="recipientName"
            defaultValue={address?.recipientName}
            required
            aria-invalid={Boolean(state.fieldErrors?.recipientName)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.recipientName} />
        </div>
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium">
          {t("phone")}
        </label>
        <input
          id="phone"
          name="phone"
          defaultValue={address?.phone ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.phone)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.phone} />
      </div>

      <div>
        <label htmlFor="addressLine1" className="block text-sm font-medium">
          {t("addressLine1")}
        </label>
        <input
          id="addressLine1"
          name="addressLine1"
          defaultValue={address?.addressLine1}
          required
          aria-invalid={Boolean(state.fieldErrors?.addressLine1)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.addressLine1} />
      </div>

      <div>
        <label htmlFor="addressLine2" className="block text-sm font-medium">
          {t("addressLine2")}
        </label>
        <input
          id="addressLine2"
          name="addressLine2"
          defaultValue={address?.addressLine2 ?? ""}
          aria-invalid={Boolean(state.fieldErrors?.addressLine2)}
          className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
        />
        <FieldError message={state.fieldErrors?.addressLine2} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="city" className="block text-sm font-medium">
            {t("city")}
          </label>
          <input
            id="city"
            name="city"
            defaultValue={address?.city}
            required
            aria-invalid={Boolean(state.fieldErrors?.city)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.city} />
        </div>
        <div>
          <label htmlFor="postalCode" className="block text-sm font-medium">
            {t("postalCode")}
          </label>
          <input
            id="postalCode"
            name="postalCode"
            defaultValue={address?.postalCode ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.postalCode)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.postalCode} />
        </div>
        <div>
          <label htmlFor="country" className="block text-sm font-medium">
            {t("country")}
          </label>
          <input
            id="country"
            name="country"
            defaultValue={address?.country ?? "MK"}
            maxLength={2}
            aria-invalid={Boolean(state.fieldErrors?.country)}
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 uppercase dark:border-zinc-700"
          />
          <FieldError message={state.fieldErrors?.country} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <input
            id="isDefaultDelivery"
            name="isDefaultDelivery"
            type="checkbox"
            defaultChecked={address?.isDefaultDelivery ?? false}
            className="h-4 w-4"
          />
          <label htmlFor="isDefaultDelivery" className="text-sm font-medium">
            {t("isDefaultDelivery")}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="isDefaultBilling"
            name="isDefaultBilling"
            type="checkbox"
            defaultChecked={address?.isDefaultBilling ?? false}
            className="h-4 w-4"
          />
          <label htmlFor="isDefaultBilling" className="text-sm font-medium">
            {t("isDefaultBilling")}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input id="isActive" name="isActive" type="checkbox" defaultChecked={address?.isActive ?? true} className="h-4 w-4" />
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
