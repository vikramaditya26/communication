// Finds real published covers on Open Library for books that don't have cover art from Standard Ebooks.
//
//   node scripts/fetch-covers.mjs              # all books without a cover
//   node scripts/fetch-covers.mjs gitanjali    # just these (replaces the existing cover)
//
// Covers are saved to public/covers/<slug>.webp, and build-books.mjs picks them up.

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { BOOKS } from "./catalog.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public/covers");
const LIBRARY = path.join(ROOT, "src/data/library.json");

// Better search words for a few books whose catalog title or author doesn't match Open Library.
const QUERY = {
  "bhagavad-gita": { title: "song celestial", author: "arnold" },
  "the-upanishads": { title: "upanishads", author: "paramananda" },
  "the-koran": { title: "koran", author: "rodwell" },
  "dhammapada": { title: "dhammapada", author: "muller" },
  "gospel-of-matthew": { title: "gospel according to matthew" },
  "song-of-solomon": { title: "song of songs" },
  "poetics": { title: "poetics", author: "aristotle" },
  "the-jungle-book": { title: "the jungle book", author: "kipling" },
  "the-post-office": { title: "post office", author: "tagore" },
  "gospel-of-buddha": { title: "gospel of buddha", author: "carus" },
  "brahma-sutras": { title: "vedanta sutras", author: "thibaut" },
  "shri-bhashya": { title: "vedanta sutras", author: "thibaut" },
  "the-mesnevi": { title: "mesnevi", author: "rumi" },
  "mulla-nasruddin": { title: "turkish jester", author: "borrow" },
  "gita-govinda": { title: "indian song of songs", author: "arnold" },
  "rumi-persian-mystics": { title: "persian mystics", author: "davis" },
  "divan-of-hafiz": { title: "poems from the divan of hafiz" },
  "bustan-of-sadi": { title: "bustan", author: "sadi" },
  "grand-inquisitor": { title: "grand inquisitor", author: "dostoyevsky" },
  "chuang-tzu": { title: "chuang tzu mystic moralist", author: "giles" },
  "letters-to-his-son": { title: "letters to his son", author: "chesterfield" },
  "art-of-public-speaking": { title: "art of public speaking", author: "carnegie" },
  "indian-home-rule": { title: "hind swaraj", author: "gandhi" },
  "the-republic": { title: "republic", author: "plato" },
  "the-will-to-power": { title: "will to power", author: "nietzsche" },
};

const lastName = (author) =>
  author
    .replace(/^Translated by /, "")
    .split(/[·&,]/)[0]
    .trim()
    .split(" ")
    .pop();

const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

async function candidates(book, anyLanguage = false) {
  const q = QUERY[book.slug] ?? { title: book.title, author: lastName(book.author) };
  const params = new URLSearchParams({ title: q.title, limit: "20", fields: "key,title,cover_i,edition_count" });
  if (!anyLanguage) params.set("language", "eng");
  if (q.author) params.set("author", q.author);
  const res = await fetch(`https://openlibrary.org/search.json?${params}`, { headers: { "User-Agent": "personal-reading-app (covers)" } });
  if (!res.ok) return [];
  const want = norm(q.title);
  const docs = (await res.json()).docs.filter((d) => d.cover_i && norm(d.title).includes(want.split(" ").slice(-2).join(" ")));
  // Exact title matches first ("The Jungle Book", not "The Second Jungle Book"), then the most published.
  const exact = (d) => norm(d.title).replace(/^the /, "") === want.replace(/^the /, "");
  docs.sort((a, b) => Number(exact(b)) - Number(exact(a)) || (b.edition_count ?? 0) - (a.edition_count ?? 0));
  return docs.slice(0, 6);
}

/** Artwork scores higher than a plain white title page. */
async function coverScore(img) {
  const { channels, isOpaque } = await sharp(img).stats();
  const [r, g, b] = channels;
  const mean = (r.mean + g.mean + b.mean) / 3;
  const spread = (r.stdev + g.stdev + b.stdev) / 3;
  const colour = (Math.abs(r.mean - g.mean) + Math.abs(g.mean - b.mean) + Math.abs(r.mean - b.mean)) / 3;
  return spread + colour * 1.5 - (mean > 215 ? 40 : 0) - (mean < 25 ? 30 : 0) + (isOpaque ? 0 : -10);
}

async function cover(book) {
  // English editions first; some old translations are only catalogued without a language.
  let docs = await candidates(book);
  if (!docs.length) docs = await candidates(book, true);
  if (!docs.length) return "no match";
  let best = null;
  for (const [i, d] of docs.entries()) {
    const res = await fetch(`https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`);
    if (!res.ok) continue;
    const img = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(img).metadata().catch(() => ({}));
    if ((meta.width ?? 0) < 100) continue;
    // Small preference for the most published edition.
    const score = (await coverScore(img)) - i * 3;
    if (!best || score > best.score) best = { d, score };
  }
  if (!best) return "no usable image";
  const res = await fetch(`https://covers.openlibrary.org/b/id/${best.d.cover_i}-L.jpg`);
  const img = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(img).metadata();
  if ((meta.width ?? 0) < 180 || (meta.height ?? 0) < 250) return "image too small";
  await sharp(img).resize(600, 900, { fit: "cover", position: "top" }).webp({ quality: 82 }).toFile(path.join(OUT, `${book.slug}.webp`));
  return `ok (${best.d.title}, ${best.d.edition_count} editions)`;
}

const library = JSON.parse(await fs.readFile(LIBRARY, "utf8"));
const only = process.argv.slice(2);
const todo = only.length ? BOOKS.filter((b) => only.includes(b.slug)) : BOOKS.filter((b) => !b.src.startsWith("se:") && !library.find((l) => l.slug === b.slug)?.cover);
await fs.mkdir(OUT, { recursive: true });

for (const book of todo) {
  const result = await cover(book).catch((e) => `error ${e.message}`);
  console.log(`${result.startsWith("ok") ? "✓" : "✗"} ${book.slug.padEnd(38)} ${result}`);
  if (result.startsWith("ok")) {
    const entry = library.find((l) => l.slug === book.slug);
    if (entry) entry.cover = `/covers/${book.slug}.webp`;
  }
  await new Promise((r) => setTimeout(r, 400)); // be gentle with Open Library
}
await fs.writeFile(LIBRARY, JSON.stringify(library, null, 1));
