"use client";

import { useActionState } from "react";
import { initialFormState, type FormState } from "@/lib/forms/form-state";

export function DeleteItemForm({
  action,
  label,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  label: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <button type="submit" disabled={isPending} className="text-sm text-danger hover:underline disabled:opacity-60">
        {label}
      </button>
      {state.status === "error" && (
        <span role="alert" className="text-xs text-danger">
          {state.message}
        </span>
      )}
    </form>
  );
}
