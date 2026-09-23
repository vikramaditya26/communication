"use client";

// Keeps this device's progress in step with the others through /api/sync.
// Each key carries the time it last changed here; the newest change wins.

import { useSyncExternalStore } from "react";
import { applyRemote, changeLog, markLegacy, read, type Change } from "./store";

type Entry = { k: string; v?: unknown; t: number; d?: boolean };
export type SyncStatus = { state: "idle" | "syncing" | "ok" | "error" | "not_configured" | "locked"; at?: number; message?: string; received?: number };

let status: SyncStatus = { state: "idle" };
const listeners = new Set<() => void>();
const setStatus = (s: SyncStatus) => {
  status = s;
  listeners.forEach((l) => l());
};

export function useSyncStatus() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => status,
  );
}

const ls = {
  get: (k: string) => {
    try {
      return Number(localStorage.getItem(k)) || 0;
    } catch {
      return 0;
    }
  },
  set: (k: string, v: number) => {
    try {
      localStorage.setItem(k, String(v));
    } catch {}
  },
};

const password = () => {
  try {
    return localStorage.getItem("app-password") ?? "";
  } catch {
    return "";
  }
};

/** Recordings travel without their audio (too big); the audio stays on the device that recorded it. */
function forUpload(key: string, value: unknown) {
  if (key.startsWith("rec:") && value && typeof value === "object" && "audio" in value) {
    const rest = { ...(value as Record<string, unknown>) };
    delete rest.audio;
    return rest;
  }
  return value;
}

let running: Promise<void> | null = null;

export function syncNow(): Promise<void> {
  running ??= run().finally(() => (running = null));
  return running;
}

async function run() {
  setStatus({ ...status, state: "syncing" });
  try {
    // Data saved before sync existed has no change time yet; give it the oldest possible one.
    if (!ls.get("sync-legacy-done")) {
      await markLegacy();
      ls.set("sync-legacy-done", 1);
    }

    const pushedUpTo = ls.get("sync-pushed");
    // Only this device's own edits are sent; things that came from elsewhere are already on the server.
    const log = (await changeLog()).filter(([, c]) => c.t > pushedUpTo && !c.remote);
    const changes: Entry[] = [];
    for (const [k, c] of log) changes.push(c.deleted ? { k, t: c.t, d: true } : { k, t: c.t, v: forUpload(k, await read(k)) });

    let since = ls.get("sync-since");
    let received = 0;
    // Send in batches; each reply also brings back what changed elsewhere.
    const batches = changes.length ? Array.from({ length: Math.ceil(changes.length / 300) }, (_, i) => changes.slice(i * 300, (i + 1) * 300)) : [[]];
    for (const batch of batches) {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-password": password() },
        body: JSON.stringify({ since, changes: batch }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 503 && body.error === "not_configured") return setStatus({ state: "not_configured" });
      if (res.status === 401) return setStatus({ state: "locked", message: body.message });
      if (!res.ok) throw new Error(body.message || `Sync failed (${res.status})`);

      const local = new Map<string, Change>(await changeLog());
      for (const e of body.entries as Entry[]) {
        const mine = local.get(e.k);
        if (mine && mine.t >= e.t) continue;
        let value = e.v;
        // Keep this device's audio if the other device updated the same recording.
        if (e.k.startsWith("rec:") && value && typeof value === "object") {
          const current = await read<Record<string, unknown>>(e.k);
          if (current?.audio) value = { ...(value as object), audio: current.audio };
        }
        await applyRemote(e.k, value, { t: e.t, deleted: e.d });
        received++;
      }
      since = body.now;
      ls.set("sync-since", since);
      if (batch.length) ls.set("sync-pushed", Math.max(...batch.map((c) => c.t)));
    }
    setStatus({ state: "ok", at: Date.now(), received });
  } catch (e) {
    setStatus({ state: "error", at: Date.now(), message: e instanceof Error ? e.message : String(e) });
  }
}

/** Starts syncing in the background: on open, when you come back to the app, and shortly after changes. */
export function startAutoSync() {
  if (typeof window === "undefined") return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (status.state !== "not_configured" && status.state !== "locked") syncNow();
    }, ms);
  };
  const onVisible = () => document.visibilityState === "visible" && soon(500);
  const onChange = () => soon(4000);
  const interval = setInterval(() => document.visibilityState === "visible" && soon(0), 120_000);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("store:local-change", onChange);
  window.addEventListener("online", onVisible);
  soon(1500);
  return () => {
    clearTimeout(timer);
    clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("store:local-change", onChange);
    window.removeEventListener("online", onVisible);
  };
}

/** Lets the Settings button try again after sync has been set up. */
export function retrySync() {
  setStatus({ state: "idle" });
  return syncNow();
}
