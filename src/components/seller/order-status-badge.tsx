const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
  SUBMITTED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  CONFIRMED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  PICKING: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  READY: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  OUT_FOR_DELIVERY: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  DELIVERED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function OrderStatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={
        "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium " +
        (STATUS_COLORS[status] ?? STATUS_COLORS.DRAFT)
      }
    >
      {label}
    </span>
  );
}
