"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { initialFormState } from "@/lib/forms/form-state";
import { requestCancellationAction } from "./actions";

export function CancelOrderForm({ orderId }: { orderId: string }) {
  const t = useTranslations("buyer.orders");
  const [state, formAction, pending] = useActionState(requestCancellationAction.bind(null, orderId), initialFormState);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold">{t("cancelAction")}</h2>
      <label className="flex flex-col gap-1 text-sm">
        {t("cancelReasonLabel")}
        <textarea name="reason" rows={2} className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700" />
      </label>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="self-start rounded border border-red-600 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-60 dark:border-red-400 dark:text-red-400"
      >
        {pending ? "…" : t("cancelSubmit")}
      </button>
    </form>
  );
}
