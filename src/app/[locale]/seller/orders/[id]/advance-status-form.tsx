"use client";

import { useActionState } from "react";
import { initialFormState, type FormState } from "@/lib/forms/form-state";

/**
 * One of these per status button (Picking/Ready/Out for delivery/Delivered)
 * on the order detail page - `action` is always one of the four fixed
 * Server Actions in ./actions.ts, each with its target status hardcoded
 * server-side, never read from this form's data.
 */
export function AdvanceStatusForm({
  action,
  label,
  confirmMessage,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  confirmMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {state.status === "error" && (
        <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {pending ? "…" : label}
      </button>
    </form>
  );
}
