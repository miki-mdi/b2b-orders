"use client";

import { useActionState } from "react";
import { initialFormState, type FormState } from "@/lib/forms/form-state";

/**
 * Assign/reassign/unassign the Delivery Driver responsible for this order.
 * Only rendered for a capability-holding role (orders:assign-driver -
 * Seller Admin/Sales Rep) on a non-terminal order - see
 * src/app/[locale]/seller/orders/[id]/page.tsx. The empty option represents
 * "unassigned"; `action` always carries the fixed orderId, never read from
 * form data.
 */
export function AssignDriverForm({
  action,
  drivers,
  currentMembershipId,
  unassignedLabel,
  selectLabel,
  submitLabel,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  drivers: { membershipId: string; userName: string }[];
  currentMembershipId: string | null;
  unassignedLabel: string;
  selectLabel: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {state.status === "error" && (
        <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label className="sr-only" htmlFor="assign-driver-membershipId">
          {selectLabel}
        </label>
        <select
          id="assign-driver-membershipId"
          name="membershipId"
          defaultValue={currentMembershipId ?? ""}
          className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          <option value="">{unassignedLabel}</option>
          {drivers.map((driver) => (
            <option key={driver.membershipId} value={driver.membershipId}>
              {driver.userName}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-60 dark:border-zinc-700"
      >
        {pending ? "…" : submitLabel}
      </button>
    </form>
  );
}
