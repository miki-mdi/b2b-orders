import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-surface border border-border bg-surface shadow-card ${className}`}
      {...props}
    />
  );
}
