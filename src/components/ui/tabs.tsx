"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

export type TabItem = {
  id: string;
  label: string;
  content: ReactNode;
};

/**
 * Accessible tabs (WAI-ARIA tabs pattern, "automatic activation" - arrow
 * keys both move focus and select). Same visual shell/active-segment
 * styling as CompactLocaleSwitcher/ThemeToggle (rounded-control border
 * bg-muted p-1 shell, bg-primary active pill), so this reads as the same
 * design language rather than a new one.
 *
 * Tab *content* is built server-side by the caller (already-fetched data
 * rendered to JSX) and passed in as `items[].content` - this component
 * only owns which panel is visible, not any data fetching.
 */
export function Tabs({
  items,
  ariaLabel,
  defaultTabId,
}: {
  items: TabItem[];
  ariaLabel: string;
  defaultTabId?: string;
}) {
  const initialId = items.some((item) => item.id === defaultTabId) ? defaultTabId! : items[0]?.id;
  const [activeId, setActiveId] = useState(initialId);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const next = items[nextIndex];
    setActiveId(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex flex-wrap items-center gap-1 rounded-control border border-border bg-muted p-1"
      >
        {items.map((item, index) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`tabpanel-${item.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`rounded-control px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-surface hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          id={`tabpanel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${item.id}`}
          hidden={item.id !== activeId}
          tabIndex={0}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
