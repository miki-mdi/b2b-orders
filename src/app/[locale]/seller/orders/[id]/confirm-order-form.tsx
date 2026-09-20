"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { initialFormState } from "@/lib/forms/form-state";
import { FieldError } from "@/components/forms/field-error";
import { confirmOrderAction } from "./actions";

export type ConfirmableLine = {
  id: string;
  productNameSnapshot: string;
  productSkuSnapshot: string;
  unitLabelSnapshot: string;
  requestedQty: number;
};

export function ConfirmOrderForm({ orderId, lines }: { orderId: string; lines: ConfirmableLine[] }) {
  const t = useTranslations("seller.orders");
  const [state, formAction, pending] = useActionState(confirmOrderAction.bind(null, orderId), initialFormState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h2 className="text-lg font-semibold">{t("confirmSection")}</h2>
        <p className="text-sm text-zinc-500">{t("confirmHint")}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th scope="col" className="py-2 pr-4 font-medium">
                {t("columnProduct")}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t("columnRequestedQty")}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t("columnConfirmedQty")}
              </th>
              <th scope="col" className="py-2 font-medium">
                {t("confirmReasonLabel")}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-zinc-100 align-top dark:border-zinc-900">
                <td className="py-2 pr-4">
                  <div>{line.productNameSnapshot}</div>
                  <div className="text-xs text-zinc-500">
                    {line.productSkuSnapshot} · {line.unitLabelSnapshot}
                  </div>
                </td>
                <td className="py-2 pr-4">{line.requestedQty}</td>
                <td className="py-2 pr-4">
                  <label className="sr-only" htmlFor={`qty-${line.id}`}>
                    {t("columnConfirmedQty")}
                  </label>
                  <input
                    id={`qty-${line.id}`}
                    name={`qty-${line.id}`}
                    type="number"
                    defaultValue={line.requestedQty}
                    min={0}
                    max={line.requestedQty}
                    step="any"
                    className="w-24 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700"
                  />
                  <FieldError message={state.fieldErrors?.[`line-${line.id}`]} />
                </td>
                <td className="py-2">
                  <label className="sr-only" htmlFor={`reason-${line.id}`}>
                    {t("confirmReasonLabel")}
                  </label>
                  <input
                    id={`reason-${line.id}`}
                    name={`reason-${line.id}`}
                    type="text"
                    className="w-full min-w-48 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="self-start rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {pending ? "…" : t("confirmSubmit")}
      </button>
    </form>
  );
}
