// Downloads every book in scripts/catalog.mjs, cleans it, and splits it into pages.
//
//   node scripts/build-books.mjs            # build all books
//   node scripts/build-books.mjs gitanjali  # build only the given slugs
//
// Output:
//   src/data/library.json                 list of books for the library screen
//   public/books/<slug>/index.json        table of contents + page count
//   public/books/<slug>/<n>.json          pages, CHUNK pages per file
//   public/covers/<slug>.webp             cover art (Standard Ebooks books only)
//
// Raw downloads are cached in .cache/ so re-running is fast.

import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import sharp from "sharp";
import { BOOKS } from "./catalog.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, ".cache");
const OUT_BOOKS = path.join(ROOT, "public/books");
const OUT_COVERS = path.join(ROOT, "public/covers");
const LIBRARY = path.join(ROOT, "src/data/library.json");

const TARGET_WORDS = 230; // a comfortable page to read aloud
const MAX_WORDS = 320;
const CHUNK = 25;

// ── Downloads ────────────────────────────────────────────────────────

async function fetchCached(url, { binary = false } = {}) {
  const file = path.join(CACHE, url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9._-]/g, "_"));
  try {
    return binary ? await fs.readFile(file) : await fs.readFile(file, "utf8");
  } catch {}
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "personal-reading-app (book import script)" } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
      await fs.mkdir(CACHE, { recursive: true });
      await fs.writeFile(file, data);
      return data;
    } catch (err) {
      if (attempt >= 4) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

// ── Text → blocks ────────────────────────────────────────────────────
// A block is { h, l } heading, { p } paragraph, or { v: [lines] } verse.

const clean = (s) =>
  s
    .replace(/[⁠­]/g, "")
    .replace(/[    ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const SKIP_TAGS = new Set(["script", "style", "img", "figure", "figcaption", "aside", "nav", "svg", "hr", "head", "title"]);

function extractBlocks($, root) {
  const blocks = [];
  const pushP = (text) => {
    const t = clean(text);
    if (t && /[\p{L}\p{N}]/u.test(t)) blocks.push({ p: t });
  };
  const linesOf = (el) => {
    const html = $(el).html() ?? "";
    return html
      .split(/<br\s*\/?>/i)
      .map((part) => clean(cheerio.load(`<div>${part}</div>`)("div").text()))
      .filter(Boolean);
  };
  const isTocLike = (el) => {
    const all = clean($(el).text()).length;
    const linked = $(el)
      .find("a[href^='#']")
      .toArray()
      .reduce((n, a) => n + clean($(a).text()).length, 0);
    return all > 0 && linked / all > 0.6;
  };

  const walk = (el) => {
    if (el.type === "text") {
      const parentTag = el.parent?.name;
      if (parentTag && ["div", "section", "article", "body", "blockquote"].includes(parentTag)) pushP(el.data ?? "");
      return;
    }
    if (el.type !== "tag") return;
    const tag = el.name;
    const cls = ($(el).attr("class") ?? "").toLowerCase();
    const epubType = ($(el).attr("epub:type") ?? "").toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (/\b(pagenum|toc|footnotes?|pg-boilerplate|figcenter|caption|transnote)\b/.test(cls)) return;
    if (/\b(noteref|pagebreak|endnotes|toc|footnote)\b/.test(epubType)) return;
    if ($(el).attr("id") === "pg-header" || $(el).attr("id") === "pg-footer") return;

    if (/^h[1-6]$/.test(tag)) {
      const t = clean($(el).text());
      if (t) blocks.push({ h: t, l: Number(tag[1]) });
      return;
    }
    if (tag === "hgroup") {
      const parts = $(el)
        .children()
        .toArray()
        .map((c) => clean($(c).text()))
        .filter(Boolean);
      const first = $(el).children().first().get(0)?.name ?? "h2";
      if (parts.length) blocks.push({ h: parts.join(": "), l: /^h[1-6]$/.test(first) ? Number(first[1]) : 2 });
      return;
    }
    if (/\b(poem|stanza|verse|linegroup|lg)\b/.test(cls) && tag === "div") {
      const lineEls = $(el).children("span, div.verse, div.line, p").toArray();
      const hasStanzas = $(el).children("div.stanza").length > 0;
      if (hasStanzas) {
        $(el).children().toArray().forEach(walk);
        return;
      }
      const lines = lineEls.length > 1 ? lineEls.map((c) => clean($(c).text())).filter(Boolean) : linesOf(el);
      if (lines.length) blocks.push({ v: lines });
      return;
    }
    if (tag === "pre") {
      const lines = $(el).text().split("\n").map(clean).filter(Boolean);
      if (lines.length) blocks.push({ v: lines });
      return;
    }
    if (tag === "p") {
      if (isTocLike(el)) return;
      if ($(el).find("br").length > 0) {
        const lines = linesOf(el);
        if (lines.length > 1) blocks.push({ v: lines });
        else if (lines.length) pushP(lines[0]);
      } else pushP($(el).text());
      return;
    }
    if (tag === "li" || tag === "dd" || tag === "dt") {
      if (isTocLike(el)) return;
      if ($(el).find("p, div, ul, ol").length) $(el).contents().toArray().forEach(walk);
      else pushP($(el).text());
      return;
    }
    if (tag === "table") {
      if (isTocLike(el)) return;
      $(el)
        .find("tr")
        .toArray()
        .forEach((tr) => {
          const cells = $(tr).children("td, th").toArray().map((c) => clean($(c).text())).filter(Boolean);
          if (cells.length) pushP(cells.join(" — "));
        });
      return;
    }
    $(el).contents().toArray().forEach(walk);
  };

  $(root).contents().toArray().forEach(walk);
  return blocks;
}

// ── Sources ──────────────────────────────────────────────────────────

const SE_SKIP = /^(titlepage|halftitlepage|imprint|colophon|uncopyright|toc|loi|endnotes|glossary)\b/;

async function loadStandardEbook(repo) {
  const base = `https://raw.githubusercontent.com/standardebooks/${repo}/master`;
  const opfXml = await fetchCached(`${base}/src/epub/content.opf`);
  if (!opfXml) throw new Error(`content.opf not found for ${repo}`);
  const opf = cheerio.load(opfXml, { xml: true });
  const manifest = new Map(opf("manifest > item").toArray().map((it) => [opf(it).attr("id"), opf(it).attr("href")]));
  const spine = opf("spine > itemref").toArray().map((it) => opf(it).attr("idref"));

  const description = cheerio
    .load(opf("metadata > dc\\:description").first().text() || "")
    .root()
    .find("p")
    .toArray()
    .map((p) => clean(cheerio.load(p).text()))
    .filter(Boolean);
  const words = Number(opf('meta[property="schema:wordCount"]').text()) || undefined;

  const blocks = [];
  for (const id of spine) {
    const href = manifest.get(id);
    if (!href || SE_SKIP.test(path.basename(href))) continue;
    const xhtml = await fetchCached(`${base}/src/epub/${href}`);
    if (!xhtml) continue;
    const $ = cheerio.load(xhtml, { xml: { xmlMode: true, decodeEntities: true } });
    $("[epub\\:type~='noteref'], a.noteref").remove();
    const fileBlocks = extractBlocks($, $("body").get(0));
    // Some books (like The Prophet) only name each chapter in the file's <title>.
    const fileTitle = clean($("head > title").text());
    const bookTitle = clean(opf("metadata > dc\\:title").first().text());
    if (fileTitle && fileTitle !== bookTitle && !fileBlocks.slice(0, 3).some((b) => b.h)) fileBlocks.unshift({ h: fileTitle, l: 2 });
    blocks.push(...fileBlocks);
  }

  const cover = await fetchCached(`${base}/images/cover.jpg`, { binary: true });
  return { blocks, description, cover, words };
}

// Gutenberg HTML often keeps the hard line wraps of the printed page inside poems:
// "…and my father's house" / "gives me pleasure no more." Join such broken lines.
function joinWrappedLines(lines) {
  const out = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev !== undefined && /^[a-z]/.test(line) && !/[.!?;:]["”’)]?$/.test(prev)) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out;
}

// KJV books arrive as "40:005:001 And seeing the multitudes…" with hard wraps.
function kjvToChapters(blocks) {
  const out = [];
  let chapter = 0;
  const stream = blocks.map((b) => (b.v ? b.v.join(" ") : (b.p ?? ""))).join(" ");
  const verses = stream.split(/(?=\b\d+:\d+:\d+\s)/);
  for (const text of verses) {
    const m = text.trim().match(/^\d+:(\d+):(\d+)\s+(.*)$/);
    if (!m) continue;
    const [ch, verse, body] = [Number(m[1]), Number(m[2]), m[3].trim()];
    if (ch !== chapter) {
      chapter = ch;
      out.push({ h: `Chapter ${ch}`, l: 2 });
    }
    out.push({ p: `${verse} ${body}` });
  }
  return out;
}

async function loadGutenberg(id, book) {
  let html = await fetchCached(`https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.html`);
  if (!html) html = await fetchCached(`https://www.gutenberg.org/ebooks/${id}.html.images`);
  if (!html) throw new Error(`Gutenberg #${id} not found`);
  const $ = cheerio.load(html);
  const pgTitle = clean($("title").text());
  $("#pg-header, #pg-footer, section.pg-boilerplate, .pg-boilerplate, .pagenum, span.pagenum, a.fnanchor, .fnanchor, .tnote, .transnote").remove();
  let blocks = extractBlocks($, $("body").get(0));
  if (book.kjv) return { blocks: kjvToChapters(blocks), description: [], cover: null, pgTitle };
  // Drop leftover production credits at the very start.
  while (blocks.length && blocks[0].p && /^(produced by|e-?text prepared|transcribed|this etext|this ebook)/i.test(blocks[0].p)) blocks.shift();
  // Scanner and transcriber credits aren't part of the book.
  const credit = /project gutenberg|e-?text prepared|scanned by|omnipage|online distributed proofread|produced by .*(team|proofread)|transcriber'?s note|internet archive|^copyright\b|copyright convention|all rights reserved/i;
  blocks = blocks
    .filter((b) => !(b.p && /^\*\*\* ?(start|end) of (the|this) project gutenberg/i.test(b.p)))
    .filter((b) => !((b.p && b.p.length < 300 && credit.test(b.p)) || (b.h && credit.test(b.h))))
    .map((b) => (b.v ? { v: joinWrappedLines(b.v) } : b));
  return { blocks, description: [], cover: null, pgTitle };
}

// ── Pages ────────────────────────────────────────────────────────────

const wordCount = (s) => (s.match(/\S+/g) ?? []).length;
const blockWords = (b) => (b.h ? wordCount(b.h) : b.p ? wordCount(b.p) : b.v.reduce((n, l) => n + wordCount(l), 0));

function splitLongParagraph(text) {
  const sentences = text.match(/[^.!?;:]+[.!?;:]+["”’)\]]*\s*|[^.!?;:]+$/g) ?? [text];
  const parts = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && wordCount(cur) + wordCount(s) > TARGET_WORDS) {
      parts.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// A long run of headings with no text between them is a contents or illustrations list, not the book.
function dropHeadingLists(blocks) {
  const out = [];
  let run = [];
  const flush = () => {
    out.push(...(run.length > 5 ? run.slice(-2) : run));
    run = [];
  };
  for (const b of blocks) {
    if (b.h) run.push(b);
    else {
      flush();
      out.push(b);
    }
  }
  flush();
  return out;
}

function paginate(input) {
  const blocks = dropHeadingLists(input);
  const pages = [];
  const toc = [];
  let page = [];
  let words = 0;
  const flush = () => {
    if (page.length) pages.push(page);
    page = [];
    words = 0;
  };
  // Merge consecutive headings (e.g. "Book I" followed by "Chapter 1").
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.h) {
      if (words >= 90) flush();
      toc.push({ t: b.h, p: pages.length, l: b.l });
      page.push(b);
      words += blockWords(b);
      continue;
    }
    if (b.p) {
      const w = wordCount(b.p);
      if (w > MAX_WORDS) {
        for (const part of splitLongParagraph(b.p)) {
          const pw = wordCount(part);
          if (words && words + pw > MAX_WORDS) flush();
          page.push({ p: part });
          words += pw;
        }
        continue;
      }
      if (words && words + w > MAX_WORDS) flush();
      else if (words >= TARGET_WORDS && w > 25) flush();
      page.push(b);
      words += w;
      continue;
    }
    if (b.v) {
      let lines = b.v;
      while (lines.length) {
        const room = Math.max(4, Math.round((MAX_WORDS - words) / 8));
        const take = words + blockWords({ v: lines }) <= MAX_WORDS ? lines.length : Math.min(lines.length, room);
        if (take < lines.length && words > 0 && room < 6) {
          flush();
          continue;
        }
        page.push({ v: lines.slice(0, take) });
        words += blockWords({ v: lines.slice(0, take) });
        lines = lines.slice(take);
        if (lines.length) flush();
      }
    }
  }
  flush();
  // A heading alone at the bottom of a page belongs on the next page.
  for (let i = 0; i < pages.length - 1; i++) {
    const last = pages[i][pages[i].length - 1];
    if (last?.h && pages[i].length > 1) {
      pages[i].pop();
      pages[i + 1].unshift(last);
      const entry = toc.find((e) => e.p === i && e.t === last.h);
      if (entry) entry.p = i + 1;
    }
  }
  return { pages, toc };
}

// Where the book itself begins, after title pages, prefaces and introductions.
function findStart(toc, title, pageCount, mode) {
  const norm = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  // Sections whose sub-headings also belong to the front matter.
  const FRONT = /\b(preface|introduction|introductory|contents|foreword|notes?|illustrations|dedication|acknowledg\w*|bibliography|index|analysis|prefatory|advertisement|epigraph|errata|glossary|appendix|chronology|biographical)\b/;
  // Single credit lines.
  const CREDIT = /\b(translators?|translated|editors?|edited|credits|transcriber|copyright)\b|^by\b/;
  // Headings that usually mark the real text. Bare numbers inside an introduction
  // are just its sub-sections, but "Chapter"/"Sura"/"Book" headings are the text itself.
  const WORD_MARKER = /^(part|book|chapter|canto|sura|surah|song|poem|section|act|letter|lecture|discourse)(\b|\d)/;
  const MARKER = new RegExp(`${WORD_MARKER.source}|^[ivxlcdm]+( |$)|^\\d+( |$)`);
  const limit = pageCount * 0.6;
  const t = norm(title);
  let frontLevel = null;
  let firstCandidate = null;
  for (const e of toc) {
    const h = norm(e.t);
    if (frontLevel !== null && e.l > frontLevel) {
      if (WORD_MARKER.test(h) && e.p <= limit) return e.p;
      continue;
    }
    frontLevel = null;
    if (!h) continue;
    if (FRONT.test(h)) {
      frontLevel = e.l;
      continue;
    }
    if (CREDIT.test(h) || h === t || (h.length > 5 && (t.includes(h) || h.includes(t)))) continue;
    if (mode === "first") return e.p;
    if (MARKER.test(h) && e.p <= limit) return e.p;
    firstCandidate ??= e.p;
  }
  return firstCandidate ?? 0;
}

// ── Main ─────────────────────────────────────────────────────────────

async function buildBook(book) {
  const [kind, ref] = book.src.split(":");
  const src = kind === "se" ? await loadStandardEbook(ref) : await loadGutenberg(ref, book);
  if (src.blocks.length < 3) throw new Error("no text extracted");
  const { pages, toc } = paginate(src.blocks);
  const words = src.blocks.reduce((n, b) => n + blockWords(b), 0);
  const byTitle = book.startAt ? toc.find((e) => new RegExp(book.startAt, "i").test(e.t))?.p : undefined;
  const start = book.startPage ?? byTitle ?? findStart(toc, book.title, pages.length, book.startMode);

  const dir = path.join(OUT_BOOKS, book.slug);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  for (let c = 0; c * CHUNK < pages.length; c++) {
    await fs.writeFile(path.join(dir, `${c}.json`), JSON.stringify(pages.slice(c * CHUNK, (c + 1) * CHUNK)));
  }
  await fs.writeFile(
    path.join(dir, "index.json"),
    JSON.stringify({ slug: book.slug, pages: pages.length, start, chunk: CHUNK, toc, description: src.description }),
  );

  let cover = null;
  if (src.cover) {
    await fs.mkdir(OUT_COVERS, { recursive: true });
    await sharp(src.cover).resize(600, 900, { fit: "cover" }).webp({ quality: 80 }).toFile(path.join(OUT_COVERS, `${book.slug}.webp`));
    cover = `/covers/${book.slug}.webp`;
  }

  return {
    slug: book.slug,
    title: book.title,
    subtitle: book.subtitle,
    author: book.author,
    category: book.cat,
    level: book.level,
    osho: Boolean(book.osho),
    blurb: book.blurb,
    cover,
    pages: pages.length,
    start,
    words,
    source: kind === "se" ? `https://standardebooks.org/ebooks/${ref}` : `https://www.gutenberg.org/ebooks/${ref}`,
    _pgTitle: src.pgTitle,
  };
}

async function main() {
  const only = process.argv.slice(2);
  const books = only.length ? BOOKS.filter((b) => only.includes(b.slug)) : BOOKS;
  let library = [];
  try {
    library = JSON.parse(await fs.readFile(LIBRARY, "utf8"));
  } catch {}

  const results = new Map(library.map((b) => [b.slug, b]));
  const failures = [];
  const queue = [...books];
  const worker = async () => {
    while (queue.length) {
      const book = queue.shift();
      try {
        const entry = await buildBook(book);
        const check = entry._pgTitle ? `  ← Gutenberg: “${entry._pgTitle.slice(0, 70)}”` : "";
        delete entry._pgTitle;
        results.set(book.slug, entry);
        console.log(`✓ ${book.slug.padEnd(38)} ${String(entry.pages).padStart(5)} pages${check}`);
      } catch (err) {
        failures.push(book.slug);
        console.log(`✗ ${book.slug}: ${err.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  const order = new Map(BOOKS.map((b, i) => [b.slug, i]));
  const out = [...results.values()].filter((b) => order.has(b.slug)).sort((a, b) => order.get(a.slug) - order.get(b.slug));
  await fs.mkdir(path.dirname(LIBRARY), { recursive: true });
  await fs.writeFile(LIBRARY, JSON.stringify(out, null, 1));
  console.log(`\n${out.length} books in library, ${failures.length} failed${failures.length ? ": " + failures.join(", ") : ""}`);
}

main();
