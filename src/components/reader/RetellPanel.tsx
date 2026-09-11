"use client";

import { MessageSquareText, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CoachTasks, Correction } from "@/lib/coach";
import { useCoach } from "@/lib/coach-client";
import { bumpToday, recordingKey, saveItem, useStoredList, write, type Recording, type SavedItem } from "@/lib/store";
import { formatClock, useSpeechCapture } from "@/lib/useSpeechCapture";
import type { LibraryBook } from "@/lib/types";
import { AudioPlayback, BetterWords, CoachNotice, Corrections, ScoreRing, SectionLabel, SpeakButton } from "../coach/Feedback";
import { MicButton } from "../coach/MicButton";
import { Button, Skeleton } from "../ui";

const MIN_WORDS = 8;
const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function RetellPanel({ book, page, pageText, saveAudio }: { book: LibraryBook; page: number; pageText: string; saveAudio: boolean }) {
  const [capPage, setCapPage] = useState<number | null>(null);
  const [asked, setAsked] = useState<{ page: number; input: CoachTasks["retell"]["input"] } | null>(null);
  const latest = useRef({ book, page, pageText });
  useEffect(() => {
    latest.current = { book, page, pageText };
  });

  const cap = useSpeechCapture({
    saveAudio,
    onFinish: ({ transcript, elapsed, audio }) => {
      if (countWords(transcript) < MIN_WORDS) return;
      const { book, page, pageText } = latest.current;
      setAsked({ page, input: { text: pageText, transcript, book: `${book.title} by ${book.author}` } });
      const id = `${Date.now()}`;
      write<Recording>(recordingKey(id), {
        id,
        kind: "retell",
        title: `Retelling · ${book.title}, page ${page + 1}`,
        slug: book.slug,
        page,
        createdAt: Date.now(),
        durationMs: elapsed,
        transcript,
        audio: audio ?? undefined,
      });
      bumpToday("spoken", Math.round(elapsed / 1000));
    },
  });

  const state = capPage === page ? cap.state : "idle";
  const coach = useCoach("retell", asked && asked.page === page ? asked.input : null, { auto: true });
  const [savedList] = useStoredList<SavedItem>("saved:grammar-");
  const savedTexts = useMemo(() => new Set(savedList.map((s) => s.text)), [savedList]);

  const start = () => {
    setCapPage(page);
    setAsked(null);
    cap.start();
  };
  const saveCorrection = (c: Correction) => saveItem({ kind: "grammar", text: c.better, note: c.why, detail: { youSaid: c.youSaid }, slug: book.slug, page });

  if (state === "listening" || state === "stopping") {
    return (
      <div className="flex flex-col items-center p-6 text-center">
        <MicButton state={state} onStart={start} onStop={cap.stop} size={88} />
        <div className="mt-4 font-display text-3xl tabular-nums">{formatClock(cap.elapsed)}</div>
        <div className="mt-1 text-sm text-ink-3">Explain the page in your own words</div>
        <div className="mt-5 max-h-40 max-w-sm overflow-y-auto text-[15px] leading-relaxed text-ink-2">
          {cap.transcript} <span className="text-ink-3">{cap.interim}</span>
        </div>
      </div>
    );
  }

  const tooShort = state === "done" && countWords(cap.transcript) < MIN_WORDS;

  return (
    <div className="space-y-6 p-5">
      {(state === "idle" || state === "error" || tooShort) && (
        <div className="rounded-3xl bg-gradient-to-br from-accent-soft via-accent-soft/40 to-transparent p-5">
          <MessageSquareText className="text-accent" size={24} />
          <div className="mt-3 font-display text-2xl leading-tight">Retell this page</div>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            Without looking at the text, say what this page was about in your own words. Half a minute to a minute is plenty.
          </p>
          {state === "error" && cap.error && <div className="mt-3 rounded-2xl bg-bad-soft p-3 text-sm">{cap.error}</div>}
          {tooShort && <div className="mt-3 rounded-2xl bg-warn-soft p-3 text-sm">That was very short. Try saying at least two or three sentences.</div>}
          <div className="mt-5">
            <MicButton state={state === "done" ? "idle" : state} onStart={start} onStop={cap.stop} />
          </div>
        </div>
      )}

      {state === "done" && !tooShort && (
        <>
          <div>
            <SectionLabel>What you said</SectionLabel>
            <div className="rounded-2xl bg-paper-2 p-3.5 text-[15px] leading-relaxed text-ink-2">{cap.transcript}</div>
          </div>
          {cap.audio && <AudioPlayback blob={cap.audio} />}

          {coach.loading && (
            <div className="space-y-2">
              <div className="text-sm text-ink-3">Checking your explanation…</div>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}
          {coach.error && <CoachNotice error={coach.error} onRetry={() => coach.run()} />}
          {coach.data && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex items-center gap-4 rounded-3xl border border-line bg-card p-4">
                <ScoreRing value={coach.data.understandingScore} max={5} label="Understood" size={70} suffix="/5" />
                <p className="text-[15px] leading-relaxed">{coach.data.understanding}</p>
              </div>
              <div>
                <SectionLabel>Grammar fixes</SectionLabel>
                <Corrections items={coach.data.corrections} onSave={saveCorrection} savedIds={savedTexts} />
              </div>
              {coach.data.betterWords.length > 0 && (
                <div>
                  <SectionLabel>Better words</SectionLabel>
                  <BetterWords items={coach.data.betterWords} />
                </div>
              )}
              <div className="rounded-3xl bg-ink p-4 text-paper">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-60">A better way to say it</div>
                <p className="mt-2 font-reading text-[16px] leading-relaxed">{coach.data.polishedVersion}</p>
                <div className="mt-3 [&_button]:bg-paper [&_button]:text-ink">
                  <SpeakButton text={coach.data.polishedVersion} label="Listen and repeat" />
                </div>
              </div>
              <div className="rounded-2xl bg-accent-soft p-3.5 text-sm">
                <b className="text-accent">Tip:</b> {coach.data.tip}
              </div>
            </motion.div>
          )}
          <Button variant="outline" icon={<RotateCcw size={15} />} onClick={start}>
            Try again
          </Button>
        </>
      )}
    </div>
  );
}
