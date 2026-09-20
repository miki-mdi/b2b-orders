/**
 * MVP soft-warning cut-off rule (docs/ORDER_WORKFLOW.md §5, locked): if a
 * buyer requests delivery "tomorrow" but is ordering after the tenant's
 * configured cutOffTime today, the UI shows a non-blocking warning. A
 * delivery date further out has no cut-off concern; same-day/past dates are
 * rejected by submitOrderInputSchema's own validation before this ever runs.
 *
 * Deferred (per docs/DEVELOPMENT_PLAN.md Phase 5+ and the locked MVP scope):
 * per-customer/per-route cut-offs, and HARD_BLOCK enforcement -
 * `Tenant.cutOffEnforcement` exists on the schema for that future but is
 * deliberately never read here; MVP is unconditionally non-blocking.
 */
export type CutOffTenantInfo = { cutOffTime: string | null };

const CUT_OFF_TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

export function isPastCutOffForDelivery(
  tenant: CutOffTenantInfo,
  requestedDeliveryDate: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!tenant.cutOffTime || !requestedDeliveryDate) return false;

  const match = CUT_OFF_TIME_PATTERN.exec(tenant.cutOffTime);
  if (!match) return false;
  const [, hours, minutes] = match;

  const cutOff = new Date(now);
  cutOff.setHours(Number(hours), Number(minutes), 0, 0);

  const daysUntilDelivery = Math.round(
    (startOfDay(requestedDeliveryDate).getTime() - startOfDay(now).getTime()) / 86_400_000
  );
  if (daysUntilDelivery > 1) return false;

  return now.getTime() >= cutOff.getTime();
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
