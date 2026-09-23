"use client";

import clsx from "clsx";
import { ArrowRight, ChevronLeft, ChevronRight, Ear, Mic, Repeat, RotateCcw, Volume2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { alignReading, listen, loadVoices, normalizeWord, speak, speechRecognitionSupported, stopSpeaking, type Listener, type WordMark } from "@/lib/speech";
import { bumpToday, logAttempt, recordMisses } from "@/lib/store";
import type { LibraryBook } from "@/lib/types";
import { ScoreRing, SectionLabel } from "../coach/Feedback";
import { Button } from "../ui";
import { cleanWord, type PageModel } from "./PageText";

type Chunk = { from: number; to: number; words: number[]; text: string };
type Result = { score: number; marks: WordMark[]; heard: string };
type Phase = "idle" | "playing" | "listening" | "scored";
type State = { page: number; index: number; phase: Phase; spoken: number | null; results: Record<number, Result>; heard: string };
const fresh = (page: number): State => ({ page, index: 0, phase: "idle", spoken: null, results: {}, heard: "" });
const onPage = (s: State, page: number) => (s.page === page ? s : fresh(page));

const SENTENCE_END = /[.!?]["”’)\]]*$/;
const PAUSE_END = /[,;:]["”’)\]]*$/;
const PASS = 75;

/** Splits the page into short pieces that are comfortable to repeat in one breath. */
function toChunks(model: PageModel): Chunk[] {
  const chunks: Chunk[] = [];
  let words: number[] = [];
  const flush = () => {
    if (!words.length) return;
    chunks.push({ from: words[0], to: words[words.length - 1], words, text: words.map((i) => model.tokens[i].text).join(" ") });
    words = [];
  };
  for (const t of model.tokens) {
    if (t.heading || !t.clean) {
      if (t.heading) flush();
      continue;
    }
    words.push(t.i);
    const n = words.length;
    if (SENTENCE_END.test(t.text) || (n >= 9 && PAUSE_END.test(t.text)) || n >= 20) flush();
  }
  flush();
  return chunks;
}

export type Shadow = ReturnType<typeof useShadow>;

export function useShadow({ book, page, model, rate, voice }: { book: LibraryBook; page: number; model: PageModel | null; rate: number; voice: string | null }) {
  const chunks = useMemo(() => (model ? toChunks(model) : []), [model]);
  const [state, setState] = useState<State>(() => fresh(page));
  const [auto, setAuto] = useState(true);
  const [slow, setSlow] = useState(false);
  const listener = useRef<Listener | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const watchdog = useRef<ReturnType<typeof setInterval> | null>(null);
  const spokenMs = useRef(0);
  const logged = useRef(false);
  const playRef = useRef<(index: number) => void>(() => {});

  // A new page starts fresh.
  const current = onPage(state, page);
  const latest = useRef({ chunks, current, auto, rate, voice, slow, book, page });
  useEffect(() => {
    latest.current = { chunks, current, auto, rate, voice, slow, book, page };
  });

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (watchdog.current) clearInterval(watchdog.current);
    watchdog.current = null;
  };

  const stop = useCallback(() => {
    clearTimers();
    listener.current?.stop();
    listener.current = null;
    stopSpeaking();
    setState((s) => (s.phase === "playing" || s.phase === "listening" ? { ...s, phase: "idle", spoken: null } : s));
  }, []);

  const finishPage = useCallback(() => {
    const { current, chunks, book, page } = latest.current;
    const done = Object.values(current.results);
    if (logged.current || done.length < Math.min(3, chunks.length)) return;
    logged.current = true;
    const avg = done.reduce((n, r) => n + r.score, 0) / done.length;
    logAttempt({ kind: "shadow", score: Math.round(avg), seconds: Math.round(spokenMs.current / 1000), label: `${book.title}, page ${page + 1}` });
    bumpToday("spoken", Math.round(spokenMs.current / 1000));
    spokenMs.current = 0;
    const missed: string[] = [];
    for (const [idx, r] of Object.entries(current.results)) {
      const words = chunks[Number(idx)]?.text.split(" ") ?? [];
      r.marks.forEach((m, k) => m.mark !== "good" && words[k] && missed.push(cleanWord(words[k])));
    }
    recordMisses(missed.filter(Boolean));
  }, []);

  const listenFor = useCallback(
    (index: number) => {
      const chunk = latest.current.chunks[index];
      if (!chunk) return;
      const expected = chunk.text.split(" ");
      const started = Date.now();
      let heard = "";
      let lastChange = Date.now();
      setState((s) => ({ ...onPage(s, latest.current.page), index, phase: "listening", spoken: null, heard: "" }));

      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        if (watchdog.current) clearInterval(watchdog.current);
        watchdog.current = null;
        spokenMs.current += Date.now() - started;
        const marks = alignReading(expected, heard).map((m) => (m.heard === "__unread" ? { mark: "skip" as const } : m));
        const counted = marks.filter((_, k) => normalizeWord(expected[k]));
        const score = counted.length ? Math.round((counted.filter((m) => m.mark === "good").length / counted.length) * 100) : 0;
        setState((s) => ({ ...s, phase: "scored", heard, results: { ...s.results, [index]: { score, marks, heard } } }));
        const { auto, chunks } = latest.current;
        if (!heard) return;
        if (auto && score >= PASS) {
          if (index + 1 < chunks.length) timers.current.push(setTimeout(() => playRef.current(index + 1), 1100));
          else timers.current.push(setTimeout(finishPage, 300));
        }
      };

      listener.current = listen({
        onText: (finalText, interim) => {
          const all = `${finalText} ${interim}`.trim();
          if (all !== heard) {
            heard = all;
            lastChange = Date.now();
          }
          // Stop as soon as the last word has been said.
          const marks = alignReading(expected, heard);
          const last = marks[marks.length - 1];
          if (last?.mark === "good" && heard.split(/\s+/).length >= expected.length * 0.7) listener.current?.stop();
        },
        onError: () => done(),
        onEnd: () => {
          listener.current = null;
          done();
        },
      });
      if (!listener.current) return done();
      // Stop after a pause, or if nothing is said at all.
      watchdog.current = setInterval(() => {
        const quiet = Date.now() - lastChange;
        const waited = Date.now() - started;
        if ((heard && quiet > 1500) || (!heard && waited > 7000) || waited > 25_000) listener.current?.stop();
      }, 200);
    },
    [finishPage],
  );

  const play = useCallback(
    (index: number) => {
      const { chunks, rate, voice, slow } = latest.current;
      const chunk = chunks[index];
      if (!chunk) return;
      clearTimers();
      listener.current?.stop();
      listener.current = null;
      setState((s) => ({ ...onPage(s, latest.current.page), index, phase: "playing", spoken: null }));
      const offsets: number[] = [];
      let str = "";
      for (const w of chunk.words) {
        offsets.push(str.length);
        str += (model?.tokens[w].text ?? "") + " ";
      }
      loadVoices().then(() =>
        speak(str, {
          rate: slow ? Math.max(0.55, rate * 0.75) : rate,
          voice,
          onWord: (ci) => {
            let k = 0;
            while (k + 1 < offsets.length && offsets[k + 1] <= ci) k++;
            setState((s) => ({ ...s, spoken: chunk.words[k] }));
          },
          // A short beat, then it's the learner's turn.
          onEnd: () => timers.current.push(setTimeout(() => listenFor(index), 350)),
        }),
      );
    },
    [listenFor, model],
  );
  useEffect(() => {
    playRef.current = play;
  });

  // Leaving the page (or the book) stops everything and saves the result.
  useEffect(() => {
    logged.current = false;
    return () => {
      finishPage();
      clearTimers();
      listener.current?.stop();
      listener.current = null;
    };
  }, [page, finishPage]);

  const chunk = chunks[current.index];

  /** Word colours and highlight for the page text. */
  const marks = useMemo(() => {
    if (!model || !Object.keys(current.results).length) return null;
    const out: WordMark[] = model.tokens.map(() => ({ mark: "skip", heard: "__unread" }));
    for (const [idx, r] of Object.entries(current.results)) {
      chunks[Number(idx)]?.words.forEach((w, k) => (out[w] = r.marks[k] ?? { mark: "skip" }));
    }
    return out;
  }, [model, current.results, chunks]);

  const highlight = chunk && current.phase !== "idle" ? { from: chunk.from, to: chunk.to, word: current.phase === "playing" ? current.spoken : null } : null;
  const active = current.phase === "playing" || current.phase === "listening";
  const scored = Object.values(current.results);
  const average = scored.length ? Math.round(scored.reduce((n, r) => n + r.score, 0) / scored.length) : 0;

  return {
    chunks,
    index: current.index,
    phase: current.phase,
    results: current.results,
    heard: current.heard,
    chunk,
    marks,
    highlight,
    active,
    average,
    auto,
    setAuto,
    slow,
    setSlow,
    play,
    listenAgain: () => listenFor(current.index),
    stop,
    finishPage,
  };
}

export function ShadowBody({ sh, onPickWord, onNextPage, hasNextPage }: { sh: Shadow; onPickWord: (index: number) => void; onNextPage: () => void; hasNextPage: boolean }) {
  const { chunks, index, phase, results, chunk } = sh;
  const result = results[index];
  const doneCount = Object.keys(results).length;
  const finished = chunks.length > 0 && doneCount === chunks.length && phase === "scored" && index === chunks.length - 1;

  if (!speechRecognitionSupported()) {
    return <div className="m-5 rounded-2xl bg-warn-soft p-4 text-sm">Shadowing needs the microphone. Please open this page in Google Chrome.</div>;
  }
  if (!chunks.length) return <div className="p-5 text-sm text-ink-3">There’s nothing to shadow on this page.</div>;

  if (phase === "idle" && !doneCount) {
    return (
      <div className="p-5">
        <div className="rounded-3xl bg-gradient-to-br from-accent-soft via-accent-soft/40 to-transparent p-5">
          <Repeat className="text-accent" size={24} />
          <div className="mt-3 font-display text-2xl leading-tight">Shadow this page</div>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            Listen to one sentence, then say it straight after, copying the rhythm and sounds. It’s the quickest way to pick up natural pronunciation.
          </p>
          <div className="mt-4 text-sm text-ink-3">{chunks.length} short pieces on this page</div>
          <Button className="mt-5" size="lg" icon={<Volume2 size={18} />} onClick={() => sh.play(0)}>
            Start shadowing
          </Button>
        </div>
        <Options sh={sh} />
      </div>
    );
  }

  const words = chunk?.text.split(" ") ?? [];

  return (
    <div className="space-y-5 p-5">
      {/* progress dots */}
      <div className="flex flex-wrap gap-1.5">
        {chunks.map((_, i) => {
          const r = results[i];
          return (
            <button
              key={i}
              onClick={() => sh.play(i)}
              aria-label={`Piece ${i + 1}`}
              className={clsx(
                "h-2.5 rounded-full transition-all",
                i === index ? "w-6" : "w-2.5",
                r ? (r.score >= PASS ? "bg-good" : r.score >= 50 ? "bg-warn" : "bg-bad") : i === index ? "bg-accent" : "bg-ink/15",
              )}
            />
          );
        })}
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-line bg-card p-5">
        <div className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-ink-3">
          <span>
            {index + 1} of {chunks.length}
          </span>
          <AnimatePresence mode="wait">
            <motion.span key={phase} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
              {phase === "playing" && (
                <>
                  <Ear size={14} className="text-accent" /> Listen
                </>
              )}
              {phase === "listening" && (
                <>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-bad" /> Your turn
                </>
              )}
              {phase === "scored" && result && <span className={result.score >= PASS ? "text-good" : result.score >= 50 ? "text-warn" : "text-bad"}>{result.score}% clear</span>}
            </motion.span>
          </AnimatePresence>
        </div>
        <p className="font-reading text-[21px] leading-relaxed">
          {words.map((w, k) => {
            const m = phase === "scored" ? result?.marks[k] : undefined;
            const now = phase === "playing" && sh.highlight?.word === chunk?.words[k];
            return (
              <span key={k}>
                <button
                  onClick={() => chunk && onPickWord(chunk.words[k])}
                  className={clsx(
                    "rounded px-0.5 transition-colors",
                    now && "bg-accent-2/40",
                    m?.mark === "good" && "text-good",
                    m?.mark === "bad" && "text-bad underline decoration-wavy underline-offset-4",
                    m?.mark === "skip" && "text-warn underline decoration-dotted underline-offset-4",
                  )}
                >
                  {w}
                </button>{" "}
              </span>
            );
          })}
        </p>
        {phase === "listening" && (
          <div className="mt-4 flex items-center gap-3">
            <span className="recording-pulse flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bad text-white">
              <Mic size={20} />
            </span>
            <span className="min-w-0 text-sm italic text-ink-2">{sh.heard || "Say it now…"}</span>
          </div>
        )}
        {phase === "scored" && result && (
          <div className="mt-4 text-sm text-ink-2">
            {result.heard ? (
              <>
                I heard: <span className="italic">“{result.heard}”</span>
              </>
            ) : (
              "I didn’t hear anything. Try again a little louder."
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" icon={<ChevronLeft size={15} />} onClick={() => sh.play(Math.max(0, index - 1))} disabled={index === 0 || sh.active}>
          Back
        </Button>
        <Button variant="soft" size="sm" icon={<Volume2 size={15} />} onClick={() => sh.play(index)} disabled={phase === "playing"}>
          Hear again
        </Button>
        <Button variant="soft" size="sm" icon={<RotateCcw size={15} />} onClick={sh.listenAgain} disabled={sh.active}>
          Say again
        </Button>
        {sh.active ? (
          <Button size="sm" variant="ghost" onClick={sh.stop}>
            Pause
          </Button>
        ) : index < chunks.length - 1 ? (
          <Button size="sm" onClick={() => sh.play(index + 1)} className="ml-auto">
            Next <ChevronRight size={15} />
          </Button>
        ) : null}
      </div>

      {finished && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-ink p-5 text-paper">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-paper p-1 text-ink">
              <ScoreRing value={sh.average} label="" size={64} suffix="%" />
            </div>
            <div>
              <div className="font-display text-xl">Page done</div>
              <div className="text-sm opacity-70">Average across {doneCount} pieces</div>
            </div>
          </div>
          {hasNextPage && (
            <button
              onClick={() => {
                sh.finishPage();
                onNextPage();
              }}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-paper px-4 text-sm font-medium text-ink"
            >
              Shadow the next page <ArrowRight size={15} />
            </button>
          )}
        </motion.div>
      )}

      <Options sh={sh} />
    </div>
  );
}

function Options({ sh }: { sh: Shadow }) {
  return (
    <div className="mt-5 space-y-3">
      <SectionLabel>Options</SectionLabel>
      <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
        <span>
          Keep going automatically
          <span className="block text-xs text-ink-3">Moves on when a piece is at least {PASS}% clear</span>
        </span>
        <input type="checkbox" checked={sh.auto} onChange={(e) => sh.setAuto(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
      </label>
      <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
        <span>Slower voice</span>
        <input type="checkbox" checked={sh.slow} onChange={(e) => sh.setSlow(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
      </label>
    </div>
  );
}
