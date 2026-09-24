"use client";

// Everything the app remembers lives in this browser's IndexedDB:
// reading progress, saved words, cached AI answers, and voice recordings.

import { createStore, del, entries, get, set, type UseStore } from "idb-keyval";
import { useCallback, useEffect, useState } from "react";
import { refreshNow } from "./useNow";

let store: UseStore | undefined;
let metaStore: UseStore | undefined;
const db = () => (store ??= createStore("communication", "kv"));
// When each key last changed, so two devices can be merged (see sync.ts).
const metaDb = () => (metaStore ??= createStore("communication-meta", "changes"));

/** Keys that are copied between devices. Cached AI answers and dictionary entries are not. */
export const SYNC_PREFIXES = ["progress:", "saved:", "day:", "rec:", "attempt:", "miss:", "drill:", "chat:", "pref:", "word:"];
export const isSynced = (key: string) => SYNC_PREFIXES.some((p) => key.startsWith(p));

export type Change = { t: number; deleted?: boolean; remote?: boolean };
export const changeLog = () => entries<string, Change>(metaDb());

async function markChanged(key: string, deleted = false) {
  if (!isSynced(key)) return;
  await set(key, deleted ? { t: Date.now(), deleted } : { t: Date.now() }, metaDb());
  window.dispatchEvent(new CustomEvent("store:local-change"));
}

/** Gives data saved before sync existed the oldest possible change time, so any newer copy elsewhere wins. */
export async function markLegacy() {
  const known = new Set((await changeLog()).map(([k]) => k));
  const all = await entries<string, unknown>(db());
  for (const [k] of all) if (typeof k === "string" && isSynced(k) && !known.has(k)) await set(k, { t: 1 }, metaDb());
}

/** Applies a value that came from another device, keeping its timestamp. */
export async function applyRemote(key: string, value: unknown, change: Change) {
  if (change.deleted) await del(key, db());
  else await set(key, value, db());
  await set(key, { ...change, remote: true }, metaDb());
  emit(key);
}

export function deviceId() {
  try {
    let id = localStorage.getItem("device-id");
    if (!id) {
      id = Math.random().toString(36).slice(2, 8);
      localStorage.setItem("device-id", id);
    }
    return id;
  } catch {
    return "local";
  }
}

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
  await markChanged(key);
  emit(key);
}

export async function remove(key: string) {
  await del(key, db());
  await markChanged(key, true);
  emit(key);
}

export async function readEntries<T>(prefix: string): Promise<[string, T][]> {
  const all = await entries<string, T>(db());
  return all.filter(([k]) => typeof k === "string" && k.startsWith(prefix));
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

export type RecordingKind = "read" | "retell" | "topic" | "chat";
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
// Each device keeps its own counter ("day:2026-09-24~abc123") so they add up correctly after syncing.

export type Day = { pages: number; saved: number; spoken: number; reviewed: number };
const EMPTY_DAY: Day = { pages: 0, saved: 0, spoken: 0, reviewed: 0 };
export const today = () => new Date().toLocaleDateString("en-CA");
export const dateOf = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toLocaleDateString("en-CA");
export const dayKey = (d: string) => `day:${d}~${deviceId()}`;

export async function bumpToday(field: keyof Day, by = 1) {
  const key = dayKey(today());
  const cur = (await read<Day>(key)) ?? EMPTY_DAY;
  await write<Day>(key, { ...cur, [field]: cur[field] + by });
}

/** Totals for the last `count` days, newest first, summed across devices. */
export async function readDays(count: number): Promise<{ date: string; day: Day }[]> {
  const rows = await readEntries<Day>("day:");
  const byDate = new Map<string, Day>();
  for (const [k, v] of rows) {
    const date = k.slice(4, 14);
    const cur = byDate.get(date) ?? { ...EMPTY_DAY };
    for (const f of Object.keys(EMPTY_DAY) as (keyof Day)[]) cur[f] += v?.[f] ?? 0;
    byDate.set(date, cur);
  }
  return Array.from({ length: count }, (_, i) => ({ date: dateOf(i), day: byDate.get(dateOf(i)) ?? { ...EMPTY_DAY } }));
}

export const isActiveDay = (d?: Day) => Boolean(d && d.pages + d.saved + d.spoken + d.reviewed > 0);

export function streakOf(days: { day: Day }[]) {
  let n = 0;
  // Today doesn't break the streak until the day is over.
  for (let i = isActiveDay(days[0]?.day) ? 0 : 1; i < days.length && isActiveDay(days[i].day); i++) n++;
  return n;
}

// ── Attempts (for the Progress page) ─────────────────────────────────

export type AttemptKind = "read" | "shadow" | "drill" | "topic" | "retell" | "chat";
export type Attempt = {
  kind: AttemptKind;
  at: number;
  score?: number; // 0-100
  wpm?: number;
  seconds?: number;
  detail?: Record<string, number>;
  label?: string;
};

export async function logAttempt(a: Omit<Attempt, "at">) {
  if (a.score !== undefined && !Number.isFinite(a.score)) delete a.score;
  const at = Date.now();
  await write<Attempt>(`attempt:${at}-${Math.random().toString(36).slice(2, 6)}`, { ...a, at });
}

// ── Words that were hard to say ──────────────────────────────────────

export type Miss = { word: string; count: number; last: number };
export const missKey = (word: string) => `miss:${word.toLowerCase()}`;

export async function recordMisses(words: string[]) {
  for (const w of new Set(words.map((x) => x.toLowerCase()).filter((x) => x.length > 1))) {
    const cur = await read<Miss>(missKey(w));
    await write<Miss>(missKey(w), { word: w, count: (cur?.count ?? 0) + 1, last: Date.now() });
  }
}

// ── AI answer cache ──────────────────────────────────────────────────

export const aiKey = (task: string, input: unknown) => {
  const s = JSON.stringify(input);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `ai:${task}:${(h >>> 0).toString(36)}:${s.length}`;
};

/** Live daily totals for the last `count` days (newest first). */
export function useDays(count: number) {
  const [days, setDays] = useState<{ date: string; day: Day }[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => readDays(count).then((d) => alive && setDays(d));
    load();
    const onChange = (e: Event) => String((e as CustomEvent).detail).startsWith("day:") && load();
    window.addEventListener(CHANGE, onChange);
    return () => {
      alive = false;
      window.removeEventListener(CHANGE, onChange);
    };
  }, [count]);
  return days;
}

/** Live [key, value] pairs for a prefix. */
export function useEntries<T>(prefix: string) {
  const [items, setItems] = useState<[string, T][]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => readEntries<T>(prefix).then((v) => alive && setItems(v));
    load();
    const onChange = (e: Event) => String((e as CustomEvent).detail).startsWith(prefix) && load();
    window.addEventListener(CHANGE, onChange);
    return () => {
      alive = false;
      window.removeEventListener(CHANGE, onChange);
    };
  }, [prefix]);
  return items;
}
