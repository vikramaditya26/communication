"use client";

import clsx from "clsx";
import { AudioLines, Bookmark, Headphones, RotateCcw, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CoachTasks } from "@/lib/coach";
import { useCoach } from "@/lib/coach-client";
import { alignReading, normalizeWord, type WordMark } from "@/lib/speech";
import { bumpToday, recordingKey, saveItem, write, type Recording } from "@/lib/store";
import { formatClock, useSpeechCapture } from "@/lib/useSpeechCapture";
import type { LibraryBook } from "@/lib/types";
import { AudioPlayback, CoachNotice, ScoreRing, SectionLabel } from "../coach/Feedback";
import { MicButton } from "../coach/MicButton";
import { Button, Skeleton } from "../ui";
import { cleanWord, type PageModel } from "./PageText";

export type ReadAloud = ReturnType<typeof useReadAloud>;

function accuracyOf(marks: WordMark[], expected: string[]) {
  const counted = marks.map((m, i) => ({ m, i })).filter(({ m, i }) => expected[i] && normalizeWord(expected[i]) && m.heard !== "__unread");
  const good = counted.filter(({ m }) => m.mark === "good").length;
  return { counted, accuracy: counted.length ? (good / counted.length) * 100 : 0 };
}

/** Everything about reading one page aloud. Lives in the Reader so it survives panels opening and closing. */
export function useReadAloud({
  book,
  page,
  model,
  pageText,
  saveAudio,
  onFinish,
}: {
  book: LibraryBook;
  page: number;
  model: PageModel | null;
  pageText: string;
  saveAudio: boolean;
  onFinish?: () => void;
}) {
  const expected = useMemo(() => (model ? model.tokens.map((t) => (t.heading ? "" : t.text)) : []), [model]);
  const [capPage, setCapPage] = useState<number | null>(null);
  const latest = useRef({ book, page, expected, onFinish });
  useEffect(() => {
    latest.current = { book, page, expected, onFinish };
  });

  const cap = useSpeechCapture({
    saveAudio,
    onFinish: ({ transcript, elapsed, audio }) => {
      const { book, page, expected, onFinish } = latest.current;
      if (transcript) {
        const id = `${Date.now()}`;
        write<Recording>(recordingKey(id), {
          id,
          kind: "read",
          title: `${book.title} · page ${page + 1}`,
          slug: book.slug,
          page,
          createdAt: Date.now(),
          durationMs: elapsed,
          transcript,
          score: Math.round(accuracyOf(alignReading(expected, transcript), expected).accuracy),
          audio: audio ?? undefined,
        });
        bumpToday("spoken", Math.round(elapsed / 1000));
      }
      onFinish?.();
    },
  });
  const { start: capStart, stop, reset } = cap;

  // An attempt belongs to the page it was made on.
  const onThisPage = capPage === page;
  const state = onThisPage ? cap.state : "idle";
  const heard = onThisPage ? `${cap.transcript} ${cap.interim}`.trim() : "";

  const [tips, setTips] = useState<{ page: number; input: CoachTasks["reading"]["input"] } | null>(null);
  const tipsCoach = useCoach("reading", tips && tips.page === page ? tips.input : null, { auto: true });
  const [savedFor, setSavedFor] = useState<number | null>(null);

  const start = useCallback(() => {
    setCapPage(page);
    setTips(null);
    setSavedFor(null);
    capStart();
  }, [page, capStart]);

  /** Word colours, live while reading and final afterwards. */
  const marks = useMemo(() => (state === "idle" || !heard || !expected.length ? null : alignReading(expected, heard)), [state, heard, expected]);

  const result = useMemo(() => {
    if (state !== "done" || !model || !marks) return null;
    const { counted, accuracy } = accuracyOf(marks, expected);
    const minutes = cap.elapsed / 60000;
    const problems = new Map<string, { word: string; index: number; heard?: string; kind: "bad" | "skip" }>();
    for (const { m, i } of counted) {
      if (m.mark === "good") continue;
      const word = cleanWord(model.tokens[i].text);
      if (!problems.has(word.toLowerCase())) problems.set(word.toLowerCase(), { word, index: i, heard: m.heard, kind: m.mark });
    }
    return {
      accuracy,
      wpm: minutes > 0.05 ? cap.transcript.split(/\s+/).filter(Boolean).length / minutes : 0,
      problems: [...problems.values()],
    };
  }, [state, marks, model, expected, cap.elapsed, cap.transcript]);

  const getTips = useCallback(() => {
    if (!result) return;
    setTips({
      page,
      input: {
        text: pageText,
        heard: cap.transcript,
        accuracy: Math.round(result.accuracy),
        wpm: Math.round(result.wpm),
        misheard: result.problems.filter((p) => p.kind === "bad").slice(0, 20).map((p) => ({ expected: p.word, heard: p.heard ?? "" })),
        missed: result.problems.filter((p) => p.kind === "skip").slice(0, 20).map((p) => p.word),
      },
    });
  }, [result, page, pageText, cap.transcript]);

  const saveProblems = useCallback(async () => {
    if (!result || !model) return;
    for (const p of result.problems.slice(0, 20)) {
      await saveItem({
        kind: "sound",
        text: p.word,
        note: p.heard ? `When you read it, it sounded like “${p.heard}”.` : "This word wasn’t clear when you read it.",
        context: model.tokens[p.index].sentence,
        slug: book.slug,
        page,
      });
    }
    setSavedFor(page);
  }, [result, model, book.slug, page]);

  const matched = marks && (state === "listening" || state === "stopping") ? marks.filter((m, i) => expected[i] && m.mark === "good").length : 0;

  return {
    state,
    cap,
    start,
    stop,
    reset,
    marks,
    result,
    tips: tipsCoach,
    getTips,
    saveProblems,
    savedProblems: savedFor === page,
    matched,
    total: expected.filter(Boolean).length,
  };
}

/** Compact bar shown over the page on phones while listening. */
export function ReadAloudBar({ ra }: { ra: ReadAloud }) {
  const { cap } = ra;
  return (
    <div className="flex items-center gap-3 rounded-full border border-line bg-card/95 p-1.5 pr-5 shadow-lift backdrop-blur-xl">
      <MicButton state={ra.state} onStart={ra.start} onStop={ra.stop} size={52} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="h-2 w-2 animate-pulse rounded-full bg-bad" />
          Listening · {formatClock(cap.elapsed)}
        </div>
        <div className="truncate text-xs text-ink-3">{cap.interim || cap.transcript.split(" ").slice(-8).join(" ") || "Start reading the page aloud"}</div>
      </div>
      <div className="text-right text-xs tabular-nums text-ink-3">
        <div className="font-display text-lg leading-none text-good">{ra.matched}</div>
        of {ra.total}
      </div>
    </div>
  );
}

export function ReadAloudBody({ ra, onPickWord, onListen, onStart }: { ra: ReadAloud; onPickWord: (index: number) => void; onListen: () => void; onStart?: () => void }) {
  const { cap, result, tips, state } = ra;
  const start = onStart ?? ra.start;

  if (state === "listening" || state === "stopping") {
    return (
      <div className="flex flex-col items-center p-6 text-center">
        <MicButton state={state} onStart={start} onStop={ra.stop} size={88} />
        <div className="mt-4 font-display text-3xl tabular-nums">{formatClock(cap.elapsed)}</div>
        <div className="mt-1 text-sm text-ink-3">
          <b className="text-good">{ra.matched}</b> of {ra.total} words heard clearly
        </div>
        <div className="mt-5 min-h-12 max-w-sm text-sm italic text-ink-2">{cap.interim || cap.transcript.split(" ").slice(-14).join(" ")}</div>
        <p className="mt-4 text-xs text-ink-3">Press stop when you finish the page.</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="p-5">
        <div className="rounded-2xl bg-bad-soft p-4 text-sm">{cap.error}</div>
        <Button className="mt-4" variant="outline" icon={<RotateCcw size={15} />} onClick={ra.reset}>
          Try again
        </Button>
      </div>
    );
  }

  if (state === "done") {
    if (!cap.transcript || !result) {
      return (
        <div className="p-5">
          <div className="rounded-2xl bg-warn-soft p-4 text-sm">I didn’t hear anything. Check that your microphone is on, then try again.</div>
          <Button className="mt-4" icon={<RotateCcw size={15} />} onClick={start}>
            Try again
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-6 p-5">
        <div className="flex items-center justify-around rounded-3xl border border-line bg-card py-5">
          <ScoreRing value={result.accuracy} label="Clear words" suffix="%" />
          <ScoreRing value={result.wpm} max={170} label="Words / min" />
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-[76px] items-center font-display text-3xl tabular-nums">{formatClock(cap.elapsed)}</div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Time</div>
          </div>
        </div>
        <p className="-mt-2 text-center text-xs leading-relaxed text-ink-3">
          {result.wpm > 0 && result.wpm < 100 ? "Good, steady pace. Clear beats fast." : result.wpm > 165 ? "A little fast. Slow down and pause at commas." : "A natural speaking pace is 120–150 words per minute."}
        </p>

        {result.problems.length > 0 ? (
          <div>
            <SectionLabel>Words to practise · tap one</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {result.problems.slice(0, 18).map((p) => (
                <motion.button
                  key={p.index}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onPickWord(p.index)}
                  className={clsx("rounded-full px-3 py-1.5 text-left text-sm transition hover:brightness-95", p.kind === "bad" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}
                >
                  <span className="font-semibold">{p.word}</span>
                  {p.heard && <span className="opacity-70"> → {p.heard}</span>}
                </motion.button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant={ra.savedProblems ? "soft" : "outline"} icon={<Bookmark size={14} />} onClick={ra.saveProblems} disabled={ra.savedProblems}>
                {ra.savedProblems ? "Saved to Review" : "Save these to Review"}
              </Button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-3">
              <span className="font-medium text-bad">Red</span> words sounded like a different word. <span className="font-medium text-warn">Yellow</span> words weren’t heard. Speech recognition isn’t perfect, so use this as a guide.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-good-soft p-4 text-sm">Every word came through clearly. Excellent reading!</div>
        )}

        {cap.audio && <AudioPlayback blob={cap.audio} label="Hear your reading" />}

        <div>
          {!tips.data && !tips.loading && !tips.error && (
            <Button className="w-full" icon={<Sparkles size={16} />} onClick={ra.getTips}>
              Get pronunciation tips
            </Button>
          )}
          {tips.loading && (
            <div className="space-y-2 rounded-3xl border border-line p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}
          {tips.error && <CoachNotice error={tips.error} onRetry={() => tips.run()} />}
          {tips.data && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 rounded-3xl border border-line bg-card p-4 text-[15px] leading-relaxed">
              <div className="font-display text-xl leading-snug">{tips.data.headline}</div>
              <div className="text-ink-2">
                <b className="text-good">Good:</b> {tips.data.whatWentWell}
              </div>
              {tips.data.focusWords.length > 0 && (
                <ul className="space-y-2.5">
                  {tips.data.focusWords.map((f, i) => (
                    <li key={i} className="rounded-2xl bg-paper-2 p-3">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <b className="text-[16px]">{f.word}</b>
                        <span className="font-display text-accent">{f.sayItLike}</span>
                        <span className="text-xs text-ink-3">{f.ipa}</span>
                      </div>
                      <div className="mt-1 text-sm text-ink-2">{f.tip}</div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="text-sm">
                <b>Rhythm:</b> <span className="text-ink-2">{tips.data.rhythmTip}</span>
              </div>
              <div className="rounded-2xl bg-accent-soft p-3 text-sm">
                <b className="text-accent">Next time:</b> {tips.data.nextStep}
              </div>
            </motion.div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button icon={<RotateCcw size={15} />} onClick={start}>
            Read again
          </Button>
          <Button variant="outline" icon={<Headphones size={15} />} onClick={onListen}>
            Hear the page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="rounded-3xl bg-gradient-to-br from-accent-soft via-accent-soft/40 to-transparent p-5">
        <AudioLines className="text-accent" size={24} />
        <div className="mt-3 font-display text-2xl leading-tight">Read this page aloud</div>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Read at a relaxed pace. Words turn <b className="text-good">green</b> when they’re clear and <b className="text-bad">red</b> when they sound like a different word. Then you’ll see which words to practise.
        </p>
        <div className="mt-5 flex items-center gap-4">
          <MicButton state={state} onStart={start} onStop={ra.stop} />
          <Button variant="ghost" icon={<Headphones size={16} />} onClick={onListen}>
            Hear it first
          </Button>
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">Works best in Google Chrome, in a quiet room, with the phone or laptop close to you.</p>
    </div>
  );
}
