"use client";

import { useSyncExternalStore } from "react";

function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): boolean {
  return true;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * True once the client has taken over from server-rendered HTML. Uses the
 * same useSyncExternalStore trick as the cart store itself (a constant
 * client snapshot vs. a constant server snapshot) instead of a
 * useState+useEffect flag flip, which this project's lint config flags as
 * an avoidable synchronous setState-in-effect.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
