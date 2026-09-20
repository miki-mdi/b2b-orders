import type { OrderActivityItem } from "@/lib/domain/orders/order-activity-service";

/** oldValue/newValue are JSON.stringify'd by writeAuditLogEntry - parses back the primitive it started as, or null for anything else (a whole-row snapshot object, invalid JSON). */
function parsePrimitive(value: string | null): string | number | boolean | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

type ActivityLabels = {
  orderCreated: string;
  statusChanged: (oldLabel: string, newLabel: string) => string;
  quantityAdjusted: (product: string, oldQty: string, newQty: string) => string;
  generic: (action: string, entity: string) => string;
  reasonLabel: (reason: string) => string;
  actorSystem: string;
};

function describeActivity(item: OrderActivityItem, labels: ActivityLabels, translateStatus: (status: string) => string): string {
  if (item.entityType === "Order" && item.action === "CREATE") {
    return labels.orderCreated;
  }
  if (item.entityType === "Order" && item.fieldName === "status") {
    const oldStatus = parsePrimitive(item.oldValue);
    const newStatus = parsePrimitive(item.newValue);
    return labels.statusChanged(
      typeof oldStatus === "string" ? translateStatus(oldStatus) : String(oldStatus ?? "-"),
      typeof newStatus === "string" ? translateStatus(newStatus) : String(newStatus ?? "-")
    );
  }
  if (item.entityType === "OrderLine" && item.fieldName === "confirmedQty") {
    const oldQty = parsePrimitive(item.oldValue);
    const newQty = parsePrimitive(item.newValue);
    return labels.quantityAdjusted(item.lineProductName ?? "-", String(oldQty ?? "-"), String(newQty ?? "-"));
  }
  return labels.generic(item.action, item.entityType);
}

export function OrderActivityTimeline({
  items,
  labels,
  translateStatus,
  locale,
  title,
  empty,
}: {
  items: OrderActivityItem[];
  labels: ActivityLabels;
  translateStatus: (status: string) => string;
  locale: string;
  title: string;
  empty: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-3 border-l border-zinc-200 pl-4 dark:border-zinc-800">
          {items.map((item) => (
            <li key={item.id} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-zinc-400 dark:bg-zinc-600" aria-hidden="true" />
              <p className="text-zinc-500 dark:text-zinc-400">
                {item.createdAt.toLocaleString(locale)} · {item.actorName ?? labels.actorSystem}
              </p>
              <p>{describeActivity(item, labels, translateStatus)}</p>
              {item.reason && <p className="text-zinc-500 dark:text-zinc-400">{labels.reasonLabel(item.reason)}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
