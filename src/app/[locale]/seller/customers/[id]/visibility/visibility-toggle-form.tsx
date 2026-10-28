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
  const buttonClassName = isHidden
    ? "text-sm font-medium text-primary underline-offset-2 hover:underline disabled:opacity-60"
    : "text-sm text-danger hover:underline disabled:opacity-60";

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <button type="submit" disabled={isPending} className={buttonClassName}>
        {isHidden ? unhideLabel : hideLabel}
      </button>
      {state.status === "error" && (
        <span role="alert" className="text-xs text-danger">
          {state.message}
        </span>
      )}
    </form>
  );
}
