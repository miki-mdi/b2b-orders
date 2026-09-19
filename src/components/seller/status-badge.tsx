export function StatusBadge({ isActive, activeLabel, inactiveLabel }: { isActive: boolean; activeLabel: string; inactiveLabel: string }) {
  return (
    <span
      className={
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium " +
        (isActive
          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
          : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300")
      }
    >
      {isActive ? activeLabel : inactiveLabel}
    </span>
  );
}
