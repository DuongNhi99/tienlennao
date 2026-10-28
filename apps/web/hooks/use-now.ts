'use client';

import { useSyncExternalStore } from 'react';

const TICK_MS = 250;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(callback: () => void) {
  listeners.add(callback);
  timer ??= setInterval(() => listeners.forEach((listener) => listener()), TICK_MS);
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Current time in whole seconds (ms precision is unnecessary for countdowns). */
function getSnapshot() {
  return Math.floor(Date.now() / 1000) * 1000;
}

/**
 * A shared clock for countdowns and relative times. Returns 0 during server rendering, so
 * callers must treat 0 as "unknown". Never use this to make game decisions: the server owns
 * turn deadlines.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}

/** Whole seconds remaining until `deadlineIso` (clamped at 0), or null if unknown. */
export function useSecondsUntil(deadlineIso: string | null): number | null {
  const now = useNow();
  if (!deadlineIso || now === 0) return null;
  return Math.max(0, Math.ceil((new Date(deadlineIso).getTime() - now) / 1000));
}
