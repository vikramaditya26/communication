"use client";

import { useCallback, useEffect, useState } from "react";
import type { BookIndex, Page } from "./types";

const indexCache = new Map<string, Promise<BookIndex>>();
const chunkCache = new Map<string, Promise<Page[]>>();

export function loadIndex(slug: string) {
  if (!indexCache.has(slug)) {
    indexCache.set(
      slug,
      fetch(`/books/${slug}/index.json`).then((r) => {
        if (!r.ok) throw new Error("Book not found");
        return r.json();
      }),
    );
  }
  return indexCache.get(slug)!;
}

export async function loadPage(slug: string, index: BookIndex, n: number): Promise<Page> {
  const c = Math.floor(n / index.chunk);
  const key = `${slug}/${c}`;
  if (!chunkCache.has(key)) {
    const p = fetch(`/books/${slug}/${c}.json`).then((r) => r.json() as Promise<Page[]>);
    p.catch(() => chunkCache.delete(key));
    chunkCache.set(key, p);
  }
  const pages = await chunkCache.get(key)!;
  return pages[n - c * index.chunk] ?? [];
}

/** Loads a book's table of contents and the requested page (plus its neighbours in the background). */
export function useBook(slug: string, pageNumber: number) {
  const [index, setIndex] = useState<BookIndex | null>(null);
  const [page, setPage] = useState<{ n: number; blocks: Page } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIndex(slug).then(setIndex, (e) => setError(String(e.message ?? e)));
  }, [slug]);

  useEffect(() => {
    if (!index) return;
    let alive = true;
    const n = Math.max(0, Math.min(pageNumber, index.pages - 1));
    loadPage(slug, index, n).then((blocks) => alive && setPage({ n, blocks }));
    // Warm the next chunk so page turns stay instant.
    if (n + 1 < index.pages) loadPage(slug, index, n + 1);
    return () => {
      alive = false;
    };
  }, [slug, index, pageNumber]);

  const chapterOf = useCallback(
    (n: number) => {
      if (!index) return null;
      let current = null;
      for (const entry of index.toc) {
        if (entry.p > n) break;
        current = entry;
      }
      return current;
    },
    [index],
  );

  return { index, page, error, chapterOf };
}
