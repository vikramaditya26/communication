"use client";

import clsx from "clsx";
import { BookOpen, ChevronDown, Clock, ExternalLink, List, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatHours } from "@/lib/library";
import type { Progress } from "@/lib/store";
import type { BookIndex, LibraryBook } from "@/lib/types";
import { loadIndex } from "@/lib/useBook";
import { Cover } from "../Cover";
import { Sheet } from "../ui";

const LEVEL_STYLE = {
  Easy: "bg-good-soft text-good",
  Medium: "bg-warn-soft text-warn",
  Challenging: "bg-bad-soft text-bad",
};

export function BookSheet({ book, progress, onClose }: { book: LibraryBook | null; progress?: Progress; onClose: () => void }) {
  // Keep showing the last book while the sheet animates closed.
  const [shown, setShown] = useState(book);
  if (book && book !== shown) setShown(book);
  const b = book ?? shown;

  return (
    <Sheet open={Boolean(book)} onClose={onClose} wide title="">
      {b && <BookDetails key={b.slug} book={b} progress={progress} />}
    </Sheet>
  );
}

function BookDetails({ book: b, progress }: { book: LibraryBook; progress?: Progress }) {
  const [index, setIndex] = useState<BookIndex | null>(null);
  const [showToc, setShowToc] = useState(false);
  const [moreAbout, setMoreAbout] = useState(false);

  useEffect(() => {
    let alive = true;
    loadIndex(b.slug).then(
      (i) => alive && setIndex(i),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [b.slug]);

  const started = progress && progress.page > 0;
  const source = b.source.includes("standardebooks") ? "Standard Ebooks" : "Project Gutenberg";
  const topLevel = index?.toc.reduce((m, e) => Math.min(m, e.l), 9) ?? 1;

  return (
    <div className="px-5 pb-8 md:px-8">
      <div className="grid gap-6 md:grid-cols-[210px_1fr] md:gap-8">
        <motion.div
          initial={{ opacity: 0, rotate: -4, y: 10 }}
          animate={{ opacity: 1, rotate: -2, y: 0 }}
          transition={{ type: "spring", damping: 18, stiffness: 180 }}
          className="mx-auto w-[150px] [container-type:inline-size] md:w-full"
        >
          <Cover book={b} sizes="large" className="shadow-lift" />
        </motion.div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {b.osho && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
                <Sparkles size={12} /> On Osho’s list
              </span>
            )}
            <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", LEVEL_STYLE[b.level])}>{b.level === "Easy" ? "Easy English" : b.level}</span>
            <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink-2">{b.category}</span>
          </div>

          <h2 className="mt-4 font-display text-[clamp(2rem,4.5vw,2.75rem)] leading-[1.02] tracking-tight" style={{ fontVariationSettings: '"SOFT" 50, "opsz" 144' }}>
            {b.title}
          </h2>
          {b.subtitle && <div className="mt-1 font-display text-xl italic text-ink-2">{b.subtitle}</div>}
          <div className="mt-2 text-[15px] text-ink-2">{b.author}</div>

          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <BookOpen size={15} className="text-ink-3" /> {b.pages.toLocaleString()} pages
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={15} className="text-ink-3" /> about {formatHours(b.words)}
            </span>
          </div>

          <p className="mt-5 text-[17px] leading-relaxed">{b.blurb}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/read/${b.slug}${started ? "" : `?page=${b.start + 1}`}`}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-medium text-accent-ink shadow-soft transition hover:brightness-110 active:scale-[0.98]"
            >
              <BookOpen size={17} />
              {started ? `Continue on page ${progress.page + 1}` : "Start reading"}
            </Link>
            <button
              onClick={() => setShowToc((s) => !s)}
              className="inline-flex h-12 items-center gap-2 rounded-full border border-line bg-card px-5 text-[15px] font-medium transition hover:border-ink-3"
            >
              <List size={17} /> Contents
              <ChevronDown size={16} className={clsx("transition", showToc && "rotate-180")} />
            </button>
          </div>
          {started && (
            <div className="mt-4 flex items-center gap-3 text-xs text-ink-3">
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-ink/10">
                <div className="h-full bg-accent" style={{ width: `${((progress.page + 1) / progress.pages) * 100}%` }} />
              </div>
              {Math.round(((progress.page + 1) / progress.pages) * 100)}% read
            </div>
          )}
        </div>
      </div>

      {showToc && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-6 overflow-hidden rounded-3xl border border-line">
          <div className="max-h-80 overflow-y-auto p-2">
            {!index && <div className="p-4 text-sm text-ink-3">Loading…</div>}
            {index?.toc.map((e, i) => (
              <Link
                key={i}
                href={`/read/${b.slug}?page=${e.p + 1}`}
                className="flex items-baseline justify-between gap-4 rounded-xl px-3 py-2 text-[15px] hover:bg-ink/5"
                style={{ paddingLeft: `${0.75 + Math.min(3, e.l - topLevel)}rem` }}
              >
                <span className={clsx("min-w-0 truncate", e.l === topLevel && "font-medium")}>{e.t}</span>
                <span className="shrink-0 text-xs tabular-nums text-ink-3">{e.p + 1}</span>
              </Link>
            ))}
            {index && !index.toc.length && <div className="p-4 text-sm text-ink-3">This book has no chapters.</div>}
          </div>
        </motion.div>
      )}

      {index?.description.length ? (
        <div className="mt-8 border-t border-line pt-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">About this book</div>
          <div className={clsx("relative space-y-3 text-[15px] leading-relaxed text-ink-2", !moreAbout && "max-h-28 overflow-hidden")}>
            {index.description.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {!moreAbout && <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />}
          </div>
          <button onClick={() => setMoreAbout((m) => !m)} className="mt-2 text-sm font-medium text-accent hover:underline">
            {moreAbout ? "Show less" : "Read more"}
          </button>
        </div>
      ) : null}

      <a href={b.source} target="_blank" rel="noreferrer" className="mt-8 inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink-2">
        Free edition from {source} <ExternalLink size={12} />
      </a>
    </div>
  );
}
