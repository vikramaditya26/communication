import data from "@/data/library.json";
import type { LibraryBook } from "./types";

export const LIBRARY = data as LibraryBook[];

export const CATEGORIES = [
  "Mystics & Scriptures",
  "Philosophy",
  "Poetry",
  "Novels & Plays",
  "Mind & Society",
  "Lives",
] as const;

export const getBook = (slug: string) => LIBRARY.find((b) => b.slug === slug);

export const readingMinutes = (words: number) => Math.max(1, Math.round(words / 200));

export function formatHours(words: number) {
  const m = readingMinutes(words);
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return h < 10 ? `${h.toFixed(1).replace(/\.0$/, "")} hrs` : `${Math.round(h)} hrs`;
}
