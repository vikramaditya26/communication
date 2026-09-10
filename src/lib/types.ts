export type Block = { h: string; l: number } | { p: string } | { v: string[] };
export type Page = Block[];

export type TocEntry = { t: string; p: number; l: number };

export type BookIndex = {
  slug: string;
  pages: number;
  start: number;
  chunk: number;
  toc: TocEntry[];
  description: string[];
};

export type Level = "Easy" | "Medium" | "Challenging";

export type LibraryBook = {
  slug: string;
  title: string;
  subtitle?: string;
  author: string;
  category: string;
  level: Level;
  osho: boolean;
  blurb: string;
  cover: string | null;
  pages: number;
  start: number;
  words: number;
  source: string;
};

export const isHeading = (b: Block): b is { h: string; l: number } => "h" in b;
export const isVerse = (b: Block): b is { v: string[] } => "v" in b;

export function blockText(b: Block): string {
  if ("h" in b) return b.h;
  if ("p" in b) return b.p;
  return b.v.join("\n");
}

export const pageText = (page: Page) => page.map(blockText).join("\n\n");
