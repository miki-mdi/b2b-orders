"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { initialFormState } from "@/lib/forms/form-state";
import { FormField, inputStyles } from "@/components/ui/form-field";
import { requestCancellationAction } from "./actions";

export function CancelOrderForm({ orderId }: { orderId: string }) {
  const t = useTranslations("buyer.orders");
  const [state, formAction, pending] = useActionState(requestCancellationAction.bind(null, orderId), initialFormState);

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <h2 className="text-sm font-semibold text-foreground">{t("cancelAction")}</h2>
      <FormField label={t("cancelReasonLabel")} htmlFor="cancel-reason">
        <textarea id="cancel-reason" name="reason" rows={2} className={inputStyles} />
      </FormField>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="self-start rounded-control border border-danger px-4 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
      >
        {pending ? "…" : t("cancelSubmit")}
      </button>
    </form>
  );
}
