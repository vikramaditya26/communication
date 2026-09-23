"use client";

import clsx from "clsx";
import { ArrowRight, ChevronLeft, ChevronRight, Flame, Layers, Mic, Search, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CATEGORIES } from "@/lib/library";
import { dayKey, read, useStoredList, type Day, type Progress, type SavedItem } from "@/lib/store";
import type { LibraryBook } from "@/lib/types";
import { Cover } from "../Cover";
import { Chip } from "../ui";
import { BookSheet } from "./BookSheet";

const FILTERS = ["All", "Osho’s list", "Easy English", ...CATEGORIES];

export function LibraryView({ books }: { books: LibraryBook[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [open, setOpen] = useState<LibraryBook | null>(null);
  const [progressList] = useStoredList<Progress>("progress:");
  const progress = useMemo(() => new Map(progressList.map((p) => [p.slug, p])), [progressList]);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter((b) => {
      if (filter === "Osho’s list" && !b.osho) return false;
      if (filter === "Easy English" && b.level !== "Easy") return false;
      if (CATEGORIES.includes(filter as (typeof CATEGORIES)[number]) && b.category !== filter) return false;
      if (!q) return true;
      return `${b.title} ${b.subtitle ?? ""} ${b.author} ${b.category}`.toLowerCase().includes(q);
    });
  }, [books, query, filter]);

  const browsing = !query.trim() && filter === "All";
  const continueReading = progressList
    .filter((p) => p.page > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((p) => ({ p, book: books.find((b) => b.slug === p.slug)! }))
    .filter((x) => x.book)
    .slice(0, 8);

  return (
    <>
      <Hero books={books} onOpen={setOpen} />

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <TodayStrip />

        {continueReading.length > 0 ? (
          <section className="mt-12">
            <ShelfTitle title="Continue reading" />
            <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
              {continueReading.map(({ p, book }) => (
                <Link
                  key={book.slug}
                  href={`/read/${book.slug}`}
                  className="group flex w-[300px] shrink-0 snap-start gap-4 rounded-3xl border border-line bg-card p-3 pr-5 transition hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <div className="w-[76px] shrink-0 [container-type:inline-size]">
                    <Cover book={book} className="shadow-soft" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col py-1">
                    <div className="line-clamp-2 font-display text-lg leading-tight">{book.title}</div>
                    <div className="mt-0.5 truncate text-[13px] text-ink-3">{book.author}</div>
                    <div className="mt-auto">
                      <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, ((p.page + 1) / p.pages) * 100)}%` }} />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-xs text-ink-3">
                        <span>
                          Page {p.page + 1} of {p.pages}
                        </span>
                        <ArrowRight size={14} className="text-accent transition group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <div className="sticky top-16 z-30 -mx-4 mt-10 border-b border-transparent bg-paper/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative flex h-11 items-center lg:w-80">
              <Search size={17} className="pointer-events-none absolute left-4 text-ink-3" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search books or authors"
                className="h-full w-full rounded-full border border-line bg-card pl-11 pr-10 text-[15px] outline-none transition placeholder:text-ink-3 focus:border-accent focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_14%,transparent)]"
              />
              {query ? (
                <button onClick={() => setQuery("")} className="absolute right-3 rounded-full p-1 text-ink-3 hover:text-ink" aria-label="Clear search">
                  <X size={16} />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-4 hidden rounded border border-line px-1.5 text-[11px] text-ink-3 md:block">⌘K</kbd>
              )}
            </label>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
              {FILTERS.map((f) => (
                <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                  {f === "Osho’s list" && <Sparkles size={13} className="-mt-0.5 mr-1 inline" />}
                  {f}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        {browsing ? (
          <div className="mt-6 space-y-12">
            <Shelf title="From Osho’s list" note="Books he talks about in Books I Have Loved" books={books.filter((b) => b.osho)} progress={progress} onOpen={setOpen} onSeeAll={() => setFilter("Osho’s list")} />
            <Shelf title="Easy English to start with" note="Short, clear books that are great for reading aloud" books={books.filter((b) => b.level === "Easy")} progress={progress} onOpen={setOpen} onSeeAll={() => setFilter("Easy English")} />
            {CATEGORIES.map((c) => (
              <Shelf key={c} title={c} books={books.filter((b) => b.category === c)} progress={progress} onOpen={setOpen} onSeeAll={() => setFilter(c)} />
            ))}
          </div>
        ) : (
          <section className="mt-6">
            <div className="mb-6 text-sm text-ink-3">
              {filtered.length} {filtered.length === 1 ? "book" : "books"}
            </div>
            {filtered.length ? (
              <motion.div layout className="grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                <AnimatePresence mode="popLayout">
                  {filtered.map((b) => (
                    <motion.div key={b.slug} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}>
                      <BookTile book={b} progress={progress.get(b.slug)} onOpen={setOpen} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            ) : (
              <div className="py-20 text-center text-ink-2">No books match “{query}”.</div>
            )}
          </section>
        )}

        <footer className="mt-20 border-t border-line py-8 text-center text-xs leading-relaxed text-ink-3">
          All books are free public-domain editions from Standard Ebooks and Project Gutenberg.
        </footer>
      </div>

      <BookSheet book={open} progress={open ? progress.get(open.slug) : undefined} onClose={() => setOpen(null)} />
    </>
  );
}

const noSubscribe = () => () => {};
const greetingNow = () => {
  const h = new Date().getHours();
  return h < 5 ? "Namaste, night owl" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

function Hero({ books, onOpen }: { books: LibraryBook[]; onOpen: (b: LibraryBook) => void }) {
  const greeting = useSyncExternalStore(noSubscribe, greetingNow, () => "Namaste");
  const fan = ["thus-spake-zarathustra", "gitanjali", "siddhartha", "tao-te-ching", "the-prophet"]
    .map((s) => books.find((b) => b.slug === s))
    .filter(Boolean) as LibraryBook[];

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-32 top-40 h-[380px] w-[380px] rounded-full bg-accent-2/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-4 pt-10 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pt-16">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}>
          <div className="text-[13px] font-semibold uppercase tracking-[0.22em] text-accent">{greeting}</div>
          <h1 className="mt-4 font-display text-[clamp(2.6rem,6.4vw,5rem)] leading-[0.95] tracking-[-0.025em]" style={{ fontVariationSettings: '"SOFT" 50, "opsz" 144' }}>
            Every page,
            <br />
            a chance to
            <br />
            <span className="italic text-accent">speak better</span>.
          </h1>
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-ink-2">
            Tap any word to learn its meaning and how to say it. Read a page aloud and see exactly which words to practise. Explain it in your own words and get friendly corrections.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/read/siddhartha" className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-medium text-accent-ink shadow-soft transition hover:brightness-110 active:scale-[0.98]">
              Start with Siddhartha <ArrowRight size={17} />
            </Link>
            <Link href="/speak" className="inline-flex h-12 items-center gap-2 rounded-full border border-line bg-card px-6 text-[15px] font-medium transition hover:border-ink-3 active:scale-[0.98]">
              <Mic size={17} className="text-accent" /> Speak on a topic
            </Link>
          </div>
        </motion.div>

        <div className="relative mx-auto hidden h-[420px] w-full max-w-[520px] md:block" style={{ perspective: 1200 }}>
          {fan.map((b, i) => {
            const offset = i - (fan.length - 1) / 2;
            return (
              <motion.button
                key={b.slug}
                onClick={() => onOpen(b)}
                className="absolute left-1/2 top-1/2 w-[190px] [container-type:inline-size]"
                style={{ zIndex: 10 - Math.abs(offset), x: "-50%", y: "-50%" }}
                initial={{ opacity: 0, rotate: 0, translateX: 0, translateY: 40 }}
                animate={{ opacity: 1, rotate: offset * 9, translateX: offset * 92, translateY: Math.abs(offset) * 18 }}
                whileHover={{ translateY: Math.abs(offset) * 18 - 26, rotate: offset * 6, scale: 1.04, zIndex: 20 }}
                transition={{ type: "spring", damping: 20, stiffness: 160, delay: 0.15 + i * 0.06 }}
              >
                <Cover book={b} className="shadow-lift" />
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TodayStrip() {
  const [days] = useStoredList<Day>("day:");
  const [saved] = useStoredList<SavedItem>("saved:");
  const [{ streak, today, due }, setStats] = useState<{ streak: number; today?: Day; due: number }>({ streak: 0, due: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const recent = await Promise.all(
        Array.from({ length: 90 }, (_, i) => read<Day>(dayKey(new Date(Date.now() - i * 86_400_000).toLocaleDateString("en-CA")))),
      );
      if (cancelled) return;
      const active = (d?: Day) => Boolean(d && d.pages + d.saved + d.spoken + d.reviewed > 0);
      let count = 0;
      // Today doesn't break the streak until the day is over.
      for (let i = active(recent[0]) ? 0 : 1; i < recent.length && active(recent[i]); i++) count++;
      const now = Date.now();
      setStats({ streak: count, today: recent[0], due: saved.filter((s) => s.due <= now).length });
    })();
    return () => {
      cancelled = true;
    };
  }, [days, saved]);

  const stats = [
    { icon: Flame, label: "Day streak", value: streak, tint: "text-accent" },
    { icon: Sparkles, label: "Pages today", value: today?.pages ?? 0, tint: "text-accent-2" },
    { icon: Mic, label: "Minutes spoken", value: Math.round((today?.spoken ?? 0) / 60), tint: "text-good" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mt-8 grid grid-cols-3 gap-2 rounded-[28px] border border-line bg-card/80 p-2 sm:gap-3 md:grid-cols-4">
      {stats.map(({ icon: Icon, label, value, tint }) => (
        <div key={label} className="flex flex-col gap-1 rounded-3xl px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
          <Icon size={22} className={tint} />
          <div>
            <div className="font-display text-2xl leading-none tabular-nums">{value}</div>
            <div className="mt-1 text-[12px] text-ink-3">{label}</div>
          </div>
        </div>
      ))}
      <Link href="/review" className="col-span-3 flex items-center justify-between gap-3 rounded-3xl bg-ink px-5 py-3.5 text-paper transition hover:brightness-110 md:col-span-1">
        <div className="flex items-center gap-3">
          <Layers size={20} />
          <div>
            <div className="text-[15px] font-medium leading-tight">{due ? `${due} to review` : "Review"}</div>
            <div className="text-[12px] opacity-70">{saved.length} saved words & fixes</div>
          </div>
        </div>
        <ArrowRight size={18} />
      </Link>
    </motion.div>
  );
}

function ShelfTitle({ title, note, onSeeAll, count }: { title: string; note?: string; onSeeAll?: () => void; count?: number }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-[26px] leading-tight tracking-tight">{title}</h2>
        {note && <p className="mt-0.5 text-sm text-ink-3">{note}</p>}
      </div>
      {onSeeAll && (
        <button onClick={onSeeAll} className="shrink-0 text-sm font-medium text-accent hover:underline">
          See all {count}
        </button>
      )}
    </div>
  );
}

function Shelf({
  title,
  note,
  books,
  progress,
  onOpen,
  onSeeAll,
}: {
  title: string;
  note?: string;
  books: LibraryBook[];
  progress: Map<string, Progress>;
  onOpen: (b: LibraryBook) => void;
  onSeeAll: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  if (!books.length) return null;
  const scroll = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <section className="group/shelf relative">
      <ShelfTitle title={title} note={note} onSeeAll={onSeeAll} count={books.length} />
      <div ref={scroller} className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-6 pt-2 sm:-mx-6 sm:gap-5 sm:px-6">
        {books.map((b) => (
          <div key={b.slug} className="w-[118px] shrink-0 snap-start sm:w-[142px] lg:w-[158px]">
            <BookTile book={b} progress={progress.get(b.slug)} onOpen={onOpen} />
          </div>
        ))}
      </div>
      <button onClick={() => scroll(-1)} aria-label="Scroll left" className="absolute -left-4 top-[45%] hidden h-11 w-11 items-center justify-center rounded-full border border-line bg-card opacity-0 shadow-soft transition group-hover/shelf:opacity-100 lg:flex">
        <ChevronLeft size={20} />
      </button>
      <button onClick={() => scroll(1)} aria-label="Scroll right" className="absolute -right-4 top-[45%] hidden h-11 w-11 items-center justify-center rounded-full border border-line bg-card opacity-0 shadow-soft transition group-hover/shelf:opacity-100 lg:flex">
        <ChevronRight size={20} />
      </button>
    </section>
  );
}

function BookTile({ book, progress, onOpen }: { book: LibraryBook; progress?: Progress; onOpen: (b: LibraryBook) => void }) {
  const pct = progress && progress.page > 0 ? ((progress.page + 1) / progress.pages) * 100 : 0;
  return (
    <button onClick={() => onOpen(book)} className="group block w-full text-left outline-none">
      <motion.div
        className="relative [container-type:inline-size]"
        style={{ transformPerspective: 900 }}
        whileHover={{ y: -8, rotateY: -12, rotateX: 3 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", damping: 18, stiffness: 260 }}
      >
        <Cover book={book} className="shadow-soft transition-shadow duration-300 group-hover:shadow-lift group-focus-visible:ring-2 group-focus-visible:ring-accent" />
        {book.osho && (
          <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm" title="On Osho’s list">
            <Sparkles size={12} />
          </span>
        )}
      </motion.div>
      {pct > 0 && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, pct)}%` }} />
        </div>
      )}
      <div className={clsx("line-clamp-2 text-[14px] font-medium leading-snug text-ink", pct > 0 ? "mt-2" : "mt-3")}>{book.title}</div>
      <div className="mt-0.5 truncate text-[12.5px] text-ink-3">{book.author.replace(/^Translated by /, "")}</div>
    </button>
  );
}
