"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ReaderTheme = "paper" | "sepia" | "night";

export type ReaderSettings = {
  fontSize: number;
  theme: ReaderTheme;
  rate: number;
  voice: string | null;
  saveAudio: boolean;
};

const DEFAULTS: ReaderSettings = { fontSize: 20, theme: "paper", rate: 0.95, voice: null, saveAudio: true };
const KEY = "reader-settings";

const listeners = new Set<() => void>();
let memoryRaw: string | null = null; // used when the browser blocks localStorage
let cachedRaw: string | null | undefined;
let cached = DEFAULTS;

function readRaw() {
  try {
    return localStorage.getItem(KEY) ?? memoryRaw;
  } catch {
    return memoryRaw;
  }
}

function getSnapshot() {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    } catch {
      cached = DEFAULTS;
    }
  }
  return cached;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function useReaderSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULTS);
  const update = useCallback((patch: Partial<ReaderSettings>) => {
    const raw = JSON.stringify({ ...getSnapshot(), ...patch });
    memoryRaw = raw;
    try {
      localStorage.setItem(KEY, raw);
    } catch {}
    listeners.forEach((l) => l());
  }, []);
  return [settings, update] as const;
}
