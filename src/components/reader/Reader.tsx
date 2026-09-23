"use client";

import clsx from "clsx";
import { ArrowLeft, AudioLines, Bookmark, ChevronLeft, ChevronRight, Headphones, List, MessageSquareText, Mic, Repeat, Sparkles, Square, Type, Volume2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReaderSettings } from "@/lib/readerSettings";
import { loadVoices, speak, stopSpeaking } from "@/lib/speech";
import { bumpToday, progressKey, saveItem, useStored, useStoredList, write, type Progress, type SavedItem } from "@/lib/store";
import { pageText as blocksToText, type LibraryBook } from "@/lib/types";
import { useBook } from "@/lib/useBook";
import { IconButton, Sheet, Skeleton, useMediaQuery } from "../ui";
import { ExplainPanel } from "./ExplainPanel";
import { buildPageModel, PageText } from "./PageText";
import { ReadAloudBar, ReadAloudBody, useReadAloud } from "./ReadAloudPanel";
import { SettingsSheet, TocSheet } from "./ReaderSheets";
import { RetellPanel } from "./RetellPanel";
import { ShadowBody, useShadow } from "./ShadowPanel";
import { WordCard } from "./WordCard";

type Tab = "explain" | "read" | "shadow" | "retell";
const TABS: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: "explain", label: "Explain", icon: Sparkles },
  { id: "read", label: "Read", icon: AudioLines },
  { id: "shadow", label: "Shadow", icon: Repeat },
  { id: "retell", label: "Retell", icon: MessageSquareText },
];
const SENTENCE_END = /[.!?;:]["”’)\]]*$/;

export function Reader({ book, initialPage }: { book: LibraryBook; initialPage: number | null }) {
  const [settings, updateSettings] = useReaderSettings();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [stored, , storedLoaded] = useStored<Progress>(progressKey(book.slug));

  // The page: chosen by the learner, or where they left off, or where the book itself begins.
  const [chosenPage, setChosenPage] = useState<number | null>(initialPage);
  const wanted = chosenPage ?? (storedLoaded ? (stored?.page ?? book.start) : null);
  const { index, page, error, chapterOf } = useBook(book.slug, wanted ?? 0);
  const pageNum = wanted === null ? null : index ? Math.min(wanted, index.pages - 1) : wanted;
  const [direction, setDirection] = useState(1);

  const current = page && page.n === pageNum ? page : null;
  const model = useMemo(() => (current ? buildPageModel(current.blocks) : null), [current]);
  const text = useMemo(() => (current ? blocksToText(current.blocks) : ""), [current]);
  const chapter = pageNum !== null ? chapterOf(pageNum) : null;

  const [active, setActive] = useState<{ i: number; rect: DOMRect } | null>(null);
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [explainSel, setExplainSel] = useState<{ text: string } | null>(null);
  const [tab, setTab] = useState<Tab>("explain");
  const [mobilePanel, setMobilePanel] = useState<Tab | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [speaking, setSpeaking] = useState<{ from: number; to: number; word: number | null } | null>(null);
  const articleRef = useRef<HTMLElement>(null);
  const stopListen = useRef<() => void>(() => {});

  const [savedWordList] = useStoredList<SavedItem>("saved:word-");
  const savedWords = useMemo(() => new Set(savedWordList.map((s) => s.text.toLowerCase())), [savedWordList]);

  const ra = useReadAloud({
    book,
    page: pageNum ?? 0,
    model,
    pageText: text,
    saveAudio: settings.saveAudio,
    // On phones, show the results as soon as the learner stops reading.
    onFinish: () => !desktop && setMobilePanel("read"),
  });
  const sh = useShadow({ book, page: pageNum ?? 0, model, rate: settings.rate, voice: settings.voice });
  const marks = ra.marks ?? sh.marks;
  const listening = ra.state === "listening" || ra.state === "stopping";

  // Karaoke: while reading aloud, the next word to say glows and the page follows along.
  const cursor = useMemo(() => {
    if (!listening || !model) return null;
    let next = 0;
    ra.marks?.forEach((m, i) => {
      if (m.mark === "good" && m.heard !== "__unread") next = i + 1;
    });
    while (next < model.tokens.length && (model.tokens[next].heading || !model.tokens[next].clean)) next++;
    return next < model.tokens.length ? next : null;
  }, [listening, model, ra.marks]);

  useEffect(() => {
    if (cursor === null) return;
    const el = articleRef.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const bottomLimit = window.innerHeight * (desktop ? 0.72 : 0.6);
    if (r.bottom > bottomLimit || r.top < 90) window.scrollBy({ top: r.top - window.innerHeight * 0.35, behavior: "smooth" });
  }, [cursor, desktop]);

  // Remember the page.
  const maxSeen = useRef(-1);
  useEffect(() => {
    if (pageNum === null || !index) return;
    write<Progress>(progressKey(book.slug), { slug: book.slug, page: pageNum, pages: index.pages, updatedAt: Date.now() });
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(pageNum + 1));
    window.history.replaceState(window.history.state, "", url);
    if (maxSeen.current >= 0 && pageNum > maxSeen.current) bumpToday("pages");
    maxSeen.current = Math.max(maxSeen.current, pageNum);
  }, [pageNum, index, book.slug]);

  const go = useCallback(
    (n: number) => {
      if (!index || pageNum === null || listening) return;
      const next = Math.max(0, Math.min(index.pages - 1, n));
      if (next === pageNum) return;
      stopListen.current();
      sh.stop();
      setDirection(next > pageNum ? 1 : -1);
      setChosenPage(next);
      setActive(null);
      setSelection(null);
      setExplainSel(null);
      window.scrollTo(0, 0);
    },
    [index, pageNum, listening, sh],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") go((pageNum ?? 0) + 1);
      if (e.key === "ArrowLeft") go((pageNum ?? 0) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, pageNum]);

  // Show a small toolbar when the learner selects a sentence.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount || !articleRef.current?.contains(sel.anchorNode)) return setSelection(null);
      const value = sel.toString().replace(/\s+/g, " ").trim();
      if (value.split(" ").length < 2) return setSelection(null);
      setSelection({ text: value.slice(0, 700), rect: sel.getRangeAt(0).getBoundingClientRect() });
    };
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 260);
    };
    document.addEventListener("selectionchange", onChange);
    window.addEventListener("scroll", onChange, { passive: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", onChange);
      window.removeEventListener("scroll", onChange);
    };
  }, []);

  useEffect(() => () => stopListen.current(), []);

  const listenToPage = useCallback(() => {
    if (!model) return;
    stopListen.current();
    const tokens = model.tokens;
    const chunks: [number, number][] = [];
    let start = 0;
    for (let k = 0; k < tokens.length; k++) {
      const headingEnds = tokens[k].heading && !tokens[k + 1]?.heading;
      if ((SENTENCE_END.test(tokens[k].text) && k - start >= 2) || k - start >= 30 || k === tokens.length - 1 || headingEnds) {
        chunks.push([start, k]);
        start = k + 1;
      }
    }
    let cancelled = false;
    const play = (c: number) => {
      if (cancelled || c >= chunks.length) return setSpeaking(null);
      const [a, b] = chunks[c];
      let str = "";
      const offsets: number[] = [];
      for (let k = a; k <= b; k++) {
        offsets.push(str.length);
        str += tokens[k].text + " ";
      }
      setSpeaking({ from: a, to: b, word: null });
      speak(str, {
        rate: settings.rate,
        voice: settings.voice,
        onWord: (ci) => {
          let idx = 0;
          while (idx + 1 < offsets.length && offsets[idx + 1] <= ci) idx++;
          setSpeaking({ from: a, to: b, word: a + idx });
        },
        onEnd: () => play(c + 1),
      });
    };
    stopListen.current = () => {
      cancelled = true;
      stopSpeaking();
      setSpeaking(null);
    };
    loadVoices().then(() => play(0));
  }, [model, settings.rate, settings.voice]);

  const onWord = useCallback((i: number, rect: DOMRect) => {
    setSelection(null);
    setActive((cur) => (cur?.i === i ? null : { i, rect }));
  }, []);
  const closeWord = useCallback(() => setActive(null), []);

  const pickWord = useCallback(
    (i: number) => {
      const el = articleRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`);
      if (!el) return;
      if (!desktop) setMobilePanel(null);
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(() => setActive({ i, rect: el.getBoundingClientRect() }), desktop ? 400 : 250);
    },
    [desktop],
  );

  const explainSelection = () => {
    if (!selection) return;
    setExplainSel({ text: selection.text });
    setTab("explain");
    if (!desktop) setMobilePanel("explain");
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  const openRetell = () => {
    setTab("retell");
    if (!desktop) setMobilePanel("retell");
  };

  const startReading = () => {
    stopListen.current();
    sh.stop();
    setMobilePanel(null);
    ra.start();
  };

  const startShadow = (i: number) => {
    stopListen.current();
    if (listening) ra.stop();
    sh.play(i);
  };
  const shadowSh = { ...sh, play: startShadow };

  // "Shadow the next page" turns the page, then starts once it has loaded.
  const shadowNext = useRef(false);
  useEffect(() => {
    if (!shadowNext.current || !sh.chunks.length) return;
    shadowNext.current = false;
    const t = setTimeout(() => sh.play(0), 400);
    return () => clearTimeout(t);
  }, [sh.chunks, sh]);

  const shadow = (
    <ShadowBody
      sh={shadowSh}
      onPickWord={pickWord}
      hasNextPage={Boolean(index && pageNum !== null && pageNum < index.pages - 1)}
      onNextPage={() => {
        shadowNext.current = true;
        go((pageNum ?? 0) + 1);
      }}
    />
  );

  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const pct = index && pageNum !== null ? ((pageNum + 1) / index.pages) * 100 : 0;
  const activeMark = active ? marks?.[active.i] : undefined;

  const explain = <ExplainPanel book={book} page={pageNum ?? 0} pageText={text} selection={explainSel} onClearSelection={() => setExplainSel(null)} onRetell={openRetell} />;
  const retell = <RetellPanel book={book} page={pageNum ?? 0} pageText={text} saveAudio={settings.saveAudio} />;

  return (
    <div
      data-reader={settings.theme}
      data-theme={settings.theme === "night" ? "dark" : settings.theme === "sepia" ? "light" : undefined}
      className="min-h-dvh bg-page text-page-ink"
    >
      <header className="sticky top-0 z-30 border-b border-line/60 bg-page/85 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-1 px-2 sm:px-4">
          <Link href="/" aria-label="Back to library" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition hover:bg-ink/5 hover:text-ink">
            <ArrowLeft size={20} />
          </Link>
          <button onClick={() => setTocOpen(true)} className="min-w-0 flex-1 px-1 text-left">
            <div className="truncate text-[14px] font-semibold leading-tight">{book.title}</div>
            <div className="truncate text-xs text-ink-3">{chapter?.t ?? book.author}</div>
          </button>
          {index && pageNum !== null && (
            <span className="mr-1 hidden text-xs tabular-nums text-ink-3 sm:block">
              {pageNum + 1} / {index.pages}
            </span>
          )}
          <IconButton label={speaking ? "Stop listening" : "Listen to this page"} active={Boolean(speaking)} onClick={() => (speaking ? stopListen.current() : listenToPage())}>
            {speaking ? <Square size={15} fill="currentColor" /> : <Headphones size={19} />}
          </IconButton>
          <IconButton label="Contents" onClick={() => setTocOpen(true)}>
            <List size={20} />
          </IconButton>
          <IconButton label="Reading settings" onClick={() => setSettingsOpen(true)}>
            <Type size={19} />
          </IconButton>
        </div>
        <div className="h-[3px] bg-ink/5">
          <motion.div className="h-full bg-accent" initial={false} animate={{ width: `${pct}%` }} transition={{ type: "spring", damping: 30, stiffness: 200 }} />
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_420px]">
        <article
          ref={articleRef}
          onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() })}
          onTouchEnd={(e) => {
            const s = touch.current;
            touch.current = null;
            if (!s || !window.getSelection()?.isCollapsed) return;
            const dx = e.changedTouches[0].clientX - s.x;
            const dy = e.changedTouches[0].clientY - s.y;
            if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && Date.now() - s.t < 600) go((pageNum ?? 0) + (dx < 0 ? 1 : -1));
          }}
          className="mx-auto w-full min-w-0 max-w-[42rem] px-6 pb-48 pt-10 font-reading sm:px-10 lg:pb-24"
          style={{ fontSize: settings.fontSize, lineHeight: 1.78 }}
        >
          {error ? (
            <div className="py-20 text-center font-sans text-ink-2">Sorry, this book could not be opened.</div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pageNum ?? -1}
                initial={{ opacity: 0, x: 20 * direction }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 * direction }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                {model ? (
                  <PageText model={model} marks={marks} activeIndex={active?.i ?? null} speaking={speaking ?? sh.highlight} cursor={cursor} savedWords={savedWords} onWord={onWord} />
                ) : (
                  <div className="space-y-4">
                    <Skeleton className="mx-auto h-8 w-1/2" />
                    {Array.from({ length: 9 }, (_, i) => (
                      <Skeleton key={i} className={clsx("h-5", i % 3 === 2 ? "w-3/4" : "w-full")} />
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}

          {index && pageNum !== null && (
            <nav className="mt-14 flex items-center justify-between gap-3 font-sans">
              <button
                onClick={() => go(pageNum - 1)}
                disabled={pageNum === 0}
                className="inline-flex h-11 items-center gap-1 rounded-full border border-line px-4 text-sm font-medium transition hover:border-ink-3 disabled:opacity-30"
              >
                <ChevronLeft size={18} /> Back
              </button>
              <span className="text-sm tabular-nums text-ink-3">
                {pageNum + 1} of {index.pages}
              </span>
              <button
                onClick={() => go(pageNum + 1)}
                disabled={pageNum >= index.pages - 1}
                className="inline-flex h-11 items-center gap-1 rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:brightness-110 disabled:opacity-30"
              >
                Next <ChevronRight size={18} />
              </button>
            </nav>
          )}
          <p className="mt-6 hidden text-center font-sans text-xs text-ink-3 lg:block">Click a word for meaning and pronunciation · select a sentence to explain it · ← → to turn pages</p>
        </article>

        <aside className="hidden border-l border-line/70 bg-card lg:block">
          <div className="sticky top-[57px] flex h-[calc(100dvh-57px)] flex-col">
            <div className="flex gap-1 border-b border-line p-2">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={clsx("relative flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors", tab === id ? "text-paper" : "text-ink-2 hover:text-ink")}
                >
                  {tab === id && <motion.span layoutId="reader-tab" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", damping: 30, stiffness: 400 }} />}
                  <Icon size={16} className="relative" />
                  <span className="relative">{label}</span>
                </button>
              ))}
            </div>
            {desktop && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div hidden={tab !== "explain"}>{explain}</div>
                <div hidden={tab !== "read"}>
                  <ReadAloudBody ra={ra} onPickWord={pickWord} onListen={listenToPage} />
                </div>
                <div hidden={tab !== "shadow"}>{shadow}</div>
                <div hidden={tab !== "retell"}>{retell}</div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Phone controls */}
      {!desktop && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] font-sans lg:hidden">
          <AnimatePresence mode="wait" initial={false}>
            {listening ? (
              <motion.div key="bar" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} className="mx-auto max-w-md">
                <ReadAloudBar ra={ra} />
              </motion.div>
            ) : (
              <motion.div key="dock" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} className="mx-auto max-w-md">
                {ra.result && mobilePanel !== "read" && (
                  <button onClick={() => setMobilePanel("read")} className="mx-auto mb-2 flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm text-paper shadow-lift">
                    <AudioLines size={15} /> {Math.round(ra.result.accuracy)}% clear · see your words
                  </button>
                )}
                <div className="flex items-center gap-1.5 rounded-full border border-line bg-card/90 p-1.5 shadow-lift backdrop-blur-xl">
                  <button onClick={() => setMobilePanel("explain")} className="flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium text-ink-2 active:bg-ink/5">
                    <Sparkles size={19} /> Explain
                  </button>
                  <button onClick={() => setMobilePanel("shadow")} className="flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium text-ink-2 active:bg-ink/5">
                    <Repeat size={19} /> Shadow
                  </button>
                  <motion.button whileTap={{ scale: 0.92 }} onClick={startReading} aria-label="Read this page aloud" className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-ink shadow-soft">
                    <Mic size={24} />
                  </motion.button>
                  <button onClick={() => setMobilePanel("retell")} className="flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium text-ink-2 active:bg-ink/5">
                    <MessageSquareText size={19} /> Retell
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {!desktop && (
        <>
          <Sheet open={mobilePanel === "explain"} onClose={() => setMobilePanel(null)} title="Explain">
            {explain}
          </Sheet>
          <Sheet open={mobilePanel === "read"} onClose={() => setMobilePanel(null)} title="Your reading">
            <ReadAloudBody
              ra={ra}
              onPickWord={pickWord}
              onStart={startReading}
              onListen={() => {
                setMobilePanel(null);
                listenToPage();
              }}
            />
          </Sheet>
          <Sheet
            open={mobilePanel === "shadow"}
            onClose={() => {
              sh.stop();
              setMobilePanel(null);
            }}
            title="Shadow"
          >
            {shadow}
          </Sheet>
          <Sheet open={mobilePanel === "retell"} onClose={() => setMobilePanel(null)} title="Retell">
            {retell}
          </Sheet>
        </>
      )}

      <AnimatePresence>
        {selection && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="fixed z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-ink p-1 font-sans text-paper shadow-lift"
            style={{
              left: Math.min(Math.max(selection.rect.left + selection.rect.width / 2, 150), window.innerWidth - 150),
              top: Math.min(window.innerHeight - 80, Math.max(70, selection.rect.bottom + (desktop ? 10 : 48))),
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <button onClick={explainSelection} className="flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium hover:bg-paper/10">
              <Sparkles size={15} /> Explain
            </button>
            <button onClick={() => speak(selection.text, { rate: settings.rate, voice: settings.voice })} className="flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium hover:bg-paper/10">
              <Volume2 size={15} /> Listen
            </button>
            <button
              onClick={() => {
                saveItem({ kind: "phrase", text: selection.text.slice(0, 300), note: "", slug: book.slug, page: pageNum ?? 0 });
                window.getSelection()?.removeAllRanges();
                setSelection(null);
              }}
              className="flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium hover:bg-paper/10"
            >
              <Bookmark size={15} /> Save
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <WordCard
        token={active && model ? (model.tokens[active.i] ?? null) : null}
        heardAs={activeMark?.mark === "bad" ? activeMark.heard : undefined}
        anchor={active?.rect ?? null}
        book={book}
        page={pageNum ?? 0}
        voice={settings.voice}
        onClose={closeWord}
      />
      <TocSheet open={tocOpen} onClose={() => setTocOpen(false)} index={index} current={pageNum ?? 0} onGo={go} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} update={updateSettings} />
    </div>
  );
}
