"use client";

import { useSyncExternalStore } from "react";

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(cb: () => void) {
  if (!listeners.size) {
    now = Date.now();
    timer = setInterval(refreshNow, 30_000);
  }
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function refreshNow() {
  now = Date.now();
  listeners.forEach((l) => l());
}

/** The current time, refreshed every 30 seconds (and whenever saved data changes). 0 while server rendering. */
export function useNow() {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
}
