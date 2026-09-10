"use client";

// Everything the app remembers lives in this browser's IndexedDB:
// reading progress, saved words, cached AI answers, and voice recordings.

import { createStore, del, entries, get, set, type UseStore } from "idb-keyval";
import { useCallback, useEffect, useState } from "react";
import { refreshNow } from "./useNow";

let store: UseStore | undefined;
const db = () => (store ??= createStore("communication", "kv"));

const CHANGE = "store:change";
const emit = (key: string) => {
  refreshNow();
  window.dispatchEvent(new CustomEvent(CHANGE, { detail: key }));
};

export async function read<T>(key: string): Promise<T | undefined> {
  return get<T>(key, db());
}

export async function write<T>(key: string, value: T) {
  await set(key, value, db());
  emit(key);
}

export async function remove(key: string) {
  await del(key, db());
  emit(key);
}

export async function readPrefix<T>(prefix: string): Promise<T[]> {
  const all = await entries<string, T>(db());
  return all.filter(([k]) => typeof k === "string" && k.startsWith(prefix)).map(([, v]) => v);
}

/** Live value of one key; re-renders when anything writes that key. */
export function useStored<T>(key: string | null) {
  const [value, setValue] = useState<T | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const load = () =>
      read<T>(key).then((v) => {
        if (!alive) return;
        setValue(v);
        setLoaded(true);
      });
    load();
    const onChange = (e: Event) => (e as CustomEvent).detail === key && load();
    window.addEventListener(CHANGE, onChange);
    return () => {
      alive = false;
      window.removeEventListener(CHANGE, onChange);
    };
  }, [key]);
  const save = useCallback((v: T) => key && write(key, v), [key]);
  return [value, save, loaded] as const;
}

/** Live list of all values whose key starts with `prefix`. */
export function useStoredList<T>(prefix: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      readPrefix<T>(prefix).then((v) => {
        if (!alive) return;
        setItems(v);
        setLoaded(true);
      });
    load();
    const onChange = (e: Event) => String((e as CustomEvent).detail).startsWith(prefix) && load();
    window.addEventListener(CHANGE, onChange);
    return () => {
      alive = false;
      window.removeEventListener(CHANGE, onChange);
    };
  }, [prefix]);
  return [items, loaded] as const;
}

// ── Reading progress ─────────────────────────────────────────────────

export type Progress = { slug: string; page: number; pages: number; updatedAt: number };
export const progressKey = (slug: string) => `progress:${slug}`;

// ── Saved items + spaced repetition ──────────────────────────────────

export type SavedKind = "word" | "phrase" | "sound" | "grammar";

export type SavedItem = {
  id: string;
  kind: SavedKind;
  text: string; // the word, phrase or sentence
  note: string; // short meaning or correction
  detail?: Record<string, unknown>;
  context?: string; // the sentence it came from
  slug?: string;
  page?: number;
  createdAt: number;
  due: number;
  interval: number; // days
  ease: number;
  reps: number;
};

export const savedKey = (id: string) => `saved:${id}`;
export const savedId = (kind: SavedKind, text: string) =>
  `${kind}-${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}`;

export async function saveItem(item: Omit<SavedItem, "id" | "createdAt" | "due" | "interval" | "ease" | "reps">) {
  const id = savedId(item.kind, item.text);
  const existing = await read<SavedItem>(savedKey(id));
  const now = Date.now();
  await write<SavedItem>(savedKey(id), {
    ...existing,
    ...item,
    id,
    createdAt: existing?.createdAt ?? now,
    due: existing?.due ?? now,
    interval: existing?.interval ?? 0,
    ease: existing?.ease ?? 2.5,
    reps: existing?.reps ?? 0,
  });
  await bumpToday("saved");
  return id;
}

export type Grade = "again" | "hard" | "good" | "easy";
const DAY = 86_400_000;

/** A small SM-2: each good answer pushes the card further into the future. */
export function nextReview(item: SavedItem, grade: Grade) {
  let { interval, ease, reps } = item;
  if (grade === "again") {
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    if (grade === "hard") ease = Math.max(1.3, ease - 0.15);
    if (grade === "easy") ease += 0.15;
    const base = reps === 1 ? 1 : reps === 2 ? 3 : interval * ease;
    interval = grade === "hard" ? Math.max(1, base * 0.6) : grade === "easy" ? base * 1.4 : base;
  }
  return { interval, ease, reps, delay: grade === "again" ? 60_000 : interval * DAY };
}

export function schedule(item: SavedItem, grade: Grade): SavedItem {
  const { interval, ease, reps, delay } = nextReview(item, grade);
  return { ...item, interval, ease, reps, due: Date.now() + delay };
}

// ── Recordings ───────────────────────────────────────────────────────

export type RecordingKind = "read" | "retell" | "topic";
export type Recording = {
  id: string;
  kind: RecordingKind;
  title: string;
  slug?: string;
  page?: number;
  createdAt: number;
  durationMs: number;
  transcript: string;
  score?: number;
  audio?: Blob;
};
export const recordingKey = (id: string) => `rec:${id}`;

// ── Daily activity (streaks) ─────────────────────────────────────────

export type Day = { pages: number; saved: number; spoken: number; reviewed: number };
export const today = () => new Date().toLocaleDateString("en-CA");
export const dayKey = (d: string) => `day:${d}`;

export async function bumpToday(field: keyof Day, by = 1) {
  const key = dayKey(today());
  const cur = (await read<Day>(key)) ?? { pages: 0, saved: 0, spoken: 0, reviewed: 0 };
  await write<Day>(key, { ...cur, [field]: cur[field] + by });
}

// ── AI answer cache ──────────────────────────────────────────────────

export const aiKey = (task: string, input: unknown) => {
  const s = JSON.stringify(input);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `ai:${task}:${(h >>> 0).toString(36)}:${s.length}`;
};
