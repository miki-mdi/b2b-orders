"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireSellerSession } from "@/lib/auth/require-seller";
import { checkActionCapability, orderReadStatusScopeFor, type Capability } from "@/lib/auth/permissions";
import { confirmOrderInputSchema } from "@/lib/validation/orders";
import { confirmOrder, advanceOrderStatus, type AdvanceableOrderStatus } from "@/lib/domain/orders/order-fulfillment-service";
import { getOrderForTenant } from "@/lib/domain/orders/order-service";
import type { FormState } from "@/lib/forms/form-state";

export async function confirmOrderAction(orderId: string, prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, "orders:confirm");
  if (forbidden) return forbidden;
  const t = await getTranslations("seller.orders");
  const locale = await getLocale();

  const order = await getOrderForTenant(session.tenantId, orderId, orderReadStatusScopeFor(session.role));
  if (!order) {
    return { status: "error", message: t("confirmErrorGeneric") };
  }

  // Every line the order actually has gets its own {qty-<id>, reason-<id>}
  // pair read directly off formData - the set of line ids to look for comes
  // from the server-fetched order, never from anything the client claims
  // exists.
  const lines = order.lines.map((line) => ({
    orderLineId: line.id,
    confirmedQty: formData.get(`qty-${line.id}`),
    reason: formData.get(`reason-${line.id}`),
  }));

  const parsed = confirmOrderInputSchema.safeParse({ lines });
  if (!parsed.success) {
    return { status: "error", message: t("confirmErrorGeneric") };
  }

  const result = await confirmOrder(session.tenantId, session.userId, orderId, parsed.data.lines);

  if (!result.ok) {
    if (result.reason === "LINE_ISSUES") {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.lineIssues) {
        fieldErrors[`line-${issue.orderLineId}`] = t(`issue.${issue.issue}`);
      }
      return { status: "error", message: t("confirmErrorGeneric"), fieldErrors };
    }
    // ORDER_NOT_FOUND / INVALID_TRANSITION - order moved on (or vanished)
    // between page load and submit.
    return { status: "error", message: t("confirmErrorGeneric") };
  }

  return redirect({ href: `/seller/orders/${orderId}`, locale });
}

const ADVANCE_CAPABILITY_BY_STATUS: Record<AdvanceableOrderStatus, Capability> = {
  PICKING: "orders:advance:PICKING",
  READY: "orders:advance:READY",
  OUT_FOR_DELIVERY: "orders:advance:OUT_FOR_DELIVERY",
  DELIVERED: "orders:advance:DELIVERED",
};

async function advanceStatusAction(orderId: string, targetStatus: AdvanceableOrderStatus): Promise<FormState> {
  const session = await requireSellerSession();
  const forbidden = checkActionCapability(session, ADVANCE_CAPABILITY_BY_STATUS[targetStatus]);
  if (forbidden) return forbidden;
  const t = await getTranslations("seller.orders");
  const locale = await getLocale();

  const result = await advanceOrderStatus(session.tenantId, session.userId, orderId, targetStatus);
  if (!result.ok) {
    return { status: "error", message: t("confirmErrorGeneric") };
  }

  return redirect({ href: `/seller/orders/${orderId}`, locale });
}

// One Server Action per button, each with its target status hardcoded here
// rather than read from form data - a request can never smuggle in an
// arbitrary status string this way, per the Phase 1D brief's explicit
// "do not allow arbitrary status assignment from browser input" rule.
export async function markPickingAction(orderId: string, _prevState: FormState, _formData: FormData) {
  return advanceStatusAction(orderId, "PICKING");
}
export async function markReadyAction(orderId: string, _prevState: FormState, _formData: FormData) {
  return advanceStatusAction(orderId, "READY");
}
export async function markOutForDeliveryAction(orderId: string, _prevState: FormState, _formData: FormData) {
  return advanceStatusAction(orderId, "OUT_FOR_DELIVERY");
}
export async function markDeliveredAction(orderId: string, _prevState: FormState, _formData: FormData) {
  return advanceStatusAction(orderId, "DELIVERED");
}
