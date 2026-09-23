"use client";

import { useSyncExternalStore } from "react";

// ── Install button (Android Chrome and desktop Chrome) ──────────────

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function setupPwa() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
  // The service worker only runs in the real (built) app, so development always shows fresh code.
  if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }
}

export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => deferred !== null,
    () => false,
  );
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    notify();
  };
  return { canInstall, install };
}

// ── Books saved for offline reading ─────────────────────────────────

export const BOOK_CACHE = "vaani-books";

export async function isBookOffline(slug: string, chunks: number) {
  if (typeof caches === "undefined") return false;
  const cache = await caches.open(BOOK_CACHE);
  return Boolean(await cache.match(`/books/${slug}/${chunks - 1}.json`));
}

/** Downloads every page of a book into the offline cache. */
export async function saveBookOffline(slug: string, pages: number, chunk: number, cover: string | null, onProgress: (done: number, total: number) => void) {
  const cache = await caches.open(BOOK_CACHE);
  const chunks = Math.ceil(pages / chunk);
  const urls = [`/books/${slug}/index.json`, ...Array.from({ length: chunks }, (_, i) => `/books/${slug}/${i}.json`), ...(cover ? [cover] : [])];
  let done = 0;
  // A few at a time, so a phone on mobile data isn't overwhelmed.
  const queue = [...urls];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const url = queue.shift()!;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not download ${url}`);
        await cache.put(url, res);
        onProgress(++done, urls.length);
      }
    }),
  );
}

export async function removeBookOffline(slug: string) {
  const cache = await caches.open(BOOK_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.filter((r) => new URL(r.url).pathname.startsWith(`/books/${slug}/`)).map((r) => cache.delete(r)));
}
