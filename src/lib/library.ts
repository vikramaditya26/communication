import data from "@/data/library.json";
import type { LibraryBook } from "./types";

export const LIBRARY = data as LibraryBook[];

// Same order as scripts/catalog.mjs. Every book is on exactly one of these shelves.
export const CATEGORIES = [
  "Osho’s Favorites",
  "Speaking & Communication",
  "Wisdom for Everyday Life",
  "Mystics & Scriptures",
  "Philosophy",
  "Poetry",
  "Great Novels & Plays",
  "Adventure",
  "Mystery & Detective",
  "Science Fiction & Fantasy",
  "Love Stories",
  "Funny Books",
  "Short Stories",
  "Children’s Classics",
  "Mind & Society",
  "Lives",
] as const;

export const CATEGORY_NOTES: Partial<Record<(typeof CATEGORIES)[number], string>> = {
  "Osho’s Favorites": "Books he talks about in Books I Have Loved",
  "Speaking & Communication": "Old, wise books about talking well",
  "Wisdom for Everyday Life": "Short books on habits, work and a calm mind",
  "Children’s Classics": "Simple English, great for reading out loud",
};

export const getBook = (slug: string) => LIBRARY.find((b) => b.slug === slug);

export const readingMinutes = (words: number) => Math.max(1, Math.round(words / 200));

export function formatHours(words: number) {
  const m = readingMinutes(words);
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return h < 10 ? `${h.toFixed(1).replace(/\.0$/, "")} hrs` : `${Math.round(h)} hrs`;
}
