"use client";

import clsx from "clsx";
import { ArrowLeft, ArrowRight, BookOpen, Check, Mic, RotateCcw, Sparkles, Volume2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Correction } from "@/lib/coach";
import { useCoach } from "@/lib/coach-client";
import { finishLesson, markTalked, PASS, type Lesson, type LessonStat } from "@/lib/grammar";
import { loadVoices, speak } from "@/lib/speech";
import { bumpToday, logAttempt, saveItem, useEntries, type SavedItem } from "@/lib/store";
import { formatClock, useSpeechCapture } from "@/lib/useSpeechCapture";
import { CoachNotice, Corrections, SectionLabel } from "../coach/Feedback";
import { MicButton } from "../coach/MicButton";
import { Button, Spinner } from "../ui";
import { ExerciseRunner, type ItemResult } from "./Exercises";

type Step = "learn" | "practice" | "speak" | "done";

const say = (text: string) => loadVoices().then(() => speak(text, { rate: 0.9 }));

export function LessonPlayer({ lesson, stat, onExit, onNext }: { lesson: Lesson; stat?: LessonStat; onExit: () => void; onNext?: () => void }) {
  const [step, setStep] = useState<Step>("learn");
  const [score, setScore] = useState<number | null>(null);
  const [round, setRound] = useState(0);

  const go = (s: Step) => {
    setStep(s);
    window.scrollTo(0, 0);
  };

  const practiced = async (results: ItemResult[]) => {
    const right = results.filter((r) => r.right).length;
    const pct = Math.round((right / Math.max(1, results.length)) * 100);
    setScore(pct);
    await finishLesson(lesson.id, pct);
    await bumpToday("reviewed", results.length);
    await logAttempt({ kind: "grammar", score: pct, label: `Grammar · ${lesson.title}` });
    go(pct >= PASS ? "speak" : "done");
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={onExit} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
          <ArrowLeft size={16} /> Grammar
        </button>
        <span className="ml-auto text-xs font-medium text-ink-3">
          Lesson {lesson.n} · {step === "learn" ? "Learn" : step === "practice" ? "Practice" : step === "speak" ? "Speak" : "Done"}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={`${step}-${round}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
          {step === "learn" && <Learn lesson={lesson} stat={stat} onStart={() => go("practice")} />}
          {step === "practice" && <ExerciseRunner items={lesson.ex.map((e, i) => ({ lesson: lesson.id, i, e }))} onDone={practiced} />}
          {step === "speak" && <Speak lesson={lesson} onDone={() => go("done")} />}
          {step === "done" && score !== null && (
            <Done
              lesson={lesson}
              score={score}
              onRetry={() => {
                setRound((r) => r + 1);
                go("practice");
              }}
              onReread={() => go("learn")}
              onExit={onExit}
              onNext={onNext}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Learn({ lesson, stat, onStart }: { lesson: Lesson; stat?: LessonStat; onStart: () => void }) {
  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-[0.18em] text-accent">Lesson {lesson.n}</div>
      <h1 className="mt-2 font-display text-[clamp(2rem,5vw,3rem)] leading-[1.05] tracking-tight">{lesson.title}</h1>
      <p className="mt-2 text-[15px] text-ink-3">{lesson.goal}</p>
      <p className="mt-6 text-[17px] leading-relaxed">{lesson.intro}</p>

      <SectionLabel className="mt-10">The rules</SectionLabel>
      <div className="space-y-3">
        {lesson.rules.map((r, k) => (
          <motion.div key={k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * k }} className="rounded-3xl border border-line bg-card p-5">
            <div className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-ink">{k + 1}</span>
              <p className="pt-0.5 text-[16px] font-medium leading-snug">{r.rule}</p>
            </div>
            <ul className="mt-3 space-y-1.5 pl-10">
              {r.examples.map((x) => (
                <li key={x}>
                  <button onClick={() => say(x)} className="group flex items-start gap-2 text-left text-[16px] leading-snug text-ink-2 hover:text-ink">
                    <Volume2 size={15} className="mt-1 shrink-0 text-ink-3 group-hover:text-accent" />
                    <span className="italic">{x}</span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      <SectionLabel className="mt-10">Common mistakes</SectionLabel>
      <div className="grid gap-3">
        {lesson.mistakes.map((m, k) => (
          <div key={k} className="rounded-3xl border border-line bg-card p-4">
            <div className="flex items-start gap-2 text-[15px] text-ink-3">
              <X size={16} className="mt-0.5 shrink-0 text-bad" />
              <span className="line-through decoration-bad/50">{m.wrong}</span>
            </div>
            <button onClick={() => say(m.right)} className="mt-1 flex items-start gap-2 text-left text-[16px] font-medium text-good">
              <Check size={16} className="mt-1 shrink-0" strokeWidth={3} />
              <span>{m.right}</span>
            </button>
            <p className="mt-1 pl-6 text-sm text-ink-2">{m.why}</p>
          </div>
        ))}
      </div>

      {lesson.wm && (
        <p className="mt-8 flex items-center gap-2 text-xs text-ink-3">
          <BookOpen size={14} /> In Wren &amp; Martin: {lesson.wm}
        </p>
      )}

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 mt-8 flex items-center gap-3 rounded-full bg-paper/80 p-1 backdrop-blur md:bottom-4">
        <Button size="lg" onClick={onStart} icon={<ArrowRight size={17} />} className="flex-1 sm:flex-none">
          {stat?.done ? "Practise again" : `Start practice · ${lesson.ex.length} questions`}
        </Button>
      </div>
    </div>
  );
}

function Speak({ lesson, onDone }: { lesson: Lesson; onDone: () => void }) {
  const [input, setInput] = useState<{ lesson: string; goal: string; task: string; transcript: string } | null>(null);
  const [tooShort, setTooShort] = useState(false);
  const cap = useSpeechCapture({
    saveAudio: false,
    onFinish: ({ transcript, elapsed }) => {
      if (transcript.split(/\s+/).filter(Boolean).length < 8) return setTooShort(true);
      bumpToday("spoken", Math.round(elapsed / 1000));
      setInput({ lesson: lesson.title, goal: lesson.goal, task: lesson.talk, transcript });
      markTalked(lesson.id);
    },
  });
  const { data, error, loading, run } = useCoach("grammar", input, { auto: true });
  const saved = useEntries<SavedItem>("saved:grammar-");
  const savedTexts = new Set(saved.map(([, v]) => v.text));
  const saveCorrection = (c: Correction) => saveItem({ kind: "grammar", text: c.better, note: c.why, context: c.youSaid });
  const busy = cap.state === "listening" || cap.state === "stopping";

  return (
    <div>
      <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-accent">
        <Mic size={15} /> Now say it
      </div>
      <h2 className="mt-3 font-display text-[clamp(1.5rem,4vw,2.1rem)] leading-snug">{lesson.talk}</h2>
      <p className="mt-2 text-sm text-ink-3">Speak for 30 to 60 seconds. The coach will check how you used today’s grammar.</p>

      {!input && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <MicButton
            state={cap.state === "done" || cap.state === "error" ? "idle" : cap.state}
            onStart={() => {
              setTooShort(false);
              cap.start();
            }}
            onStop={cap.stop}
            size={84}
          />
          <div className="text-sm tabular-nums text-ink-2">{busy ? formatClock(cap.elapsed) : "Tap to start"}</div>
          {(cap.transcript || cap.interim) && (
            <p className="max-w-lg text-center text-[15px] leading-relaxed text-ink-2">
              {cap.transcript} <span className="text-ink-3">{cap.interim}</span>
            </p>
          )}
          {tooShort && !busy && <p className="text-sm text-bad">That was a bit short. Try to say at least three sentences.</p>}
          {cap.error && <p className="text-sm text-bad">{cap.error}</p>}
        </div>
      )}

      {input && (
        <div className="mt-8">
          <SectionLabel>You said</SectionLabel>
          <p className="rounded-3xl bg-paper-2 p-4 text-[15px] leading-relaxed text-ink-2">{input.transcript}</p>
          <div className="mt-6">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-ink-2">
                <Spinner className="h-4 w-4" /> The coach is listening back…
              </div>
            )}
            {error && <CoachNotice error={error} onRetry={run} />}
            {data && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="flex items-start gap-4 rounded-3xl bg-card p-5 shadow-soft">
                  <div className="flex shrink-0 gap-1 pt-1">
                    {[1, 2, 3, 4, 5].map((k) => (
                      <span key={k} className={clsx("h-2.5 w-2.5 rounded-full", k <= data.score ? "bg-good" : "bg-ink/10")} />
                    ))}
                  </div>
                  <p className="text-[15px] leading-relaxed">{data.onTarget}</p>
                </div>
                {data.goodExamples.length > 0 && (
                  <div>
                    <SectionLabel>You got these right</SectionLabel>
                    <ul className="space-y-1.5">
                      {data.goodExamples.map((g) => (
                        <li key={g} className="flex items-start gap-2 text-[15px] text-good">
                          <Check size={16} className="mt-1 shrink-0" strokeWidth={3} /> {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <SectionLabel>Corrections</SectionLabel>
                  <Corrections items={data.corrections} onSave={saveCorrection} savedIds={savedTexts} />
                </div>
                {data.polishedVersion && (
                  <div>
                    <SectionLabel>A natural way to say it</SectionLabel>
                    <button onClick={() => say(data.polishedVersion)} className="text-left text-[16px] leading-relaxed">
                      {data.polishedVersion} <Volume2 size={15} className="ml-1 inline text-ink-3" />
                    </button>
                  </div>
                )}
                {data.tip && (
                  <p className="flex gap-2 rounded-3xl bg-accent-soft p-4 text-[15px] text-accent">
                    <Sparkles size={17} className="mt-0.5 shrink-0" /> {data.tip}
                  </p>
                )}
              </motion.div>
            )}
          </div>
        </div>
      )}

      <div className="mt-10 flex flex-wrap gap-2">
        {input && !loading && (
          <Button
            variant="outline"
            size="lg"
            icon={<RotateCcw size={16} />}
            onClick={() => {
              setInput(null);
              cap.reset();
            }}
          >
            Try again
          </Button>
        )}
        <Button size="lg" variant={input ? "primary" : "ghost"} onClick={onDone} icon={<ArrowRight size={17} />} disabled={busy}>
          {input ? "Finish lesson" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}

function Done({
  lesson,
  score,
  onRetry,
  onReread,
  onExit,
  onNext,
}: {
  lesson: Lesson;
  score: number;
  onRetry: () => void;
  onReread: () => void;
  onExit: () => void;
  onNext?: () => void;
}) {
  const pass = score >= PASS;
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);
  return (
    <div className="py-6 text-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className={clsx("mx-auto flex h-24 w-24 items-center justify-center rounded-full", pass ? "bg-good text-white" : "bg-warn-soft text-warn")}
      >
        {pass ? <Check size={44} strokeWidth={3} /> : <span className="font-display text-3xl">{score}%</span>}
      </motion.div>
      <h2 className="mt-6 font-display text-4xl">{pass ? "Lesson complete" : "Almost there"}</h2>
      <p className="mx-auto mt-2 max-w-md text-[16px] text-ink-2">
        {pass
          ? `You got ${score}% right the first time. ${lesson.title} is done, and the next lesson is open.`
          : `You got ${score}% right the first time. You need ${PASS}% to open the next lesson. Read the rules once more and try again.`}
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">Questions you got wrong will come back in your warm-up.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {pass && onNext ? (
          <Button ref={nextRef} size="lg" onClick={onNext} icon={<ArrowRight size={17} />}>
            Next lesson
          </Button>
        ) : !pass ? (
          <Button ref={nextRef} size="lg" onClick={onReread} icon={<BookOpen size={17} />}>
            Read the rules again
          </Button>
        ) : null}
        <Button size="lg" variant="outline" onClick={onRetry} icon={<RotateCcw size={16} />}>
          Practise again
        </Button>
        <Button size="lg" variant="ghost" onClick={onExit}>
          Back to Grammar
        </Button>
      </div>
    </div>
  );
}
