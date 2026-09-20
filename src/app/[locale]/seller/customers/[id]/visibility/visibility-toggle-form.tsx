"use client";

import { useActionState } from "react";
import { initialFormState, type FormState } from "@/lib/forms/form-state";

export function VisibilityToggleForm({
  action,
  isHidden,
  hideLabel,
  unhideLabel,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  isHidden: boolean;
  hideLabel: string;
  unhideLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <button type="submit" disabled={isPending} className="text-sm underline underline-offset-2 disabled:opacity-60">
        {isHidden ? unhideLabel : hideLabel}
      </button>
      {state.status === "error" && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.message}
        </span>
      )}
    </form>
  );
}
