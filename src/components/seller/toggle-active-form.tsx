"use client";

import { useActionState } from "react";
import { initialFormState, type FormState } from "@/lib/forms/form-state";

/**
 * Reused by every catalog entity's list page (category/unit/product/productUnit)
 * for the deactivate/reactivate action - the specific entity id and target
 * isActive value are bound into `action` by the server component that
 * renders each row, e.g. `toggleCategoryActiveAction.bind(null, category.id, !category.isActive)`.
 */
export function ToggleActiveForm({
  action,
  isActive,
  deactivateLabel,
  reactivateLabel,
  tone = "default",
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  isActive: boolean;
  deactivateLabel: string;
  reactivateLabel: string;
  /** "danger" is an opt-in, discreet warning-colored look for the deactivate
   * state - default stays the plain underlined text every existing
   * consumer (category/unit/productUnit list pages) already renders. */
  tone?: "default" | "danger";
}) {
  const [state, formAction, isPending] = useActionState(action, initialFormState);
  const buttonClassName =
    tone === "danger" && isActive
      ? "text-sm text-danger hover:underline disabled:opacity-60"
      : "text-sm underline underline-offset-2 disabled:opacity-60";

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <button type="submit" disabled={isPending} className={buttonClassName}>
        {isActive ? deactivateLabel : reactivateLabel}
      </button>
      {state.status === "error" && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.message}
        </span>
      )}
    </form>
  );
}
