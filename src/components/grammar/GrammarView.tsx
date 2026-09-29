"use client";

import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Flame, Lock, Play } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { isUnlocked, loadCourse, loadLesson, type GrammarMiss, type Lesson, type LessonInfo, type LessonStat, type Unit } from "@/lib/grammar";
import { bumpToday, logAttempt, today, useEntries } from "@/lib/store";
import { Button, Skeleton, Spinner } from "../ui";
import { ExerciseRunner, type Item, type ItemResult } from "./Exercises";
import { LessonPlayer } from "./LessonPlayer";

type View = { kind: "home" } | { kind: "lesson"; lesson: Lesson } | { kind: "warmup"; items: Item[] } | { kind: "warmup-done"; right: number; total: number };

const WARMUP_SIZE = 8;

export function GrammarView() {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState<View>({ kind: "home" });
  const [opening, setOpening] = useState<string | null>(null);
  const lessonEntries = useEntries<LessonStat>("grammar:lesson:");
  const missEntries = useEntries<GrammarMiss>("grammar:miss:");
  const stats = useMemo(() => new Map(lessonEntries.map(([k, v]) => [k.slice("grammar:lesson:".length), v])), [lessonEntries]);
  const misses = useMemo(() => missEntries.map(([, v]) => v).filter((m) => m && !m.fixed).sort((a, b) => a.last - b.last), [missEntries]);
  const order = useMemo(() => units?.flatMap((u) => u.lessons) ?? [], [units]);

  useEffect(() => {
    loadCourse().then(setUnits, () => setError(true));
  }, []);

  const go = (v: View) => {
    setView(v);
    window.scrollTo(0, 0);
  };

  const open = async (id: string) => {
    setOpening(id);
    try {
      go({ kind: "lesson", lesson: await loadLesson(id) });
    } catch {
      setError(true);
    } finally {
      setOpening(null);
    }
  };

  const startWarmup = async () => {
    const pick = misses.slice(0, WARMUP_SIZE);
    setOpening("warmup");
    try {
      const items = await Promise.all(pick.map(async (m) => ({ lesson: m.lesson, i: m.i, e: (await loadLesson(m.lesson)).ex[m.i] })));
      go({ kind: "warmup", items: items.filter((x) => x.e) });
    } finally {
      setOpening(null);
    }
  };

  const warmupDone = async (results: ItemResult[]) => {
    const right = results.filter((r) => r.right).length;
    await bumpToday("reviewed", results.length);
    await logAttempt({ kind: "grammar", score: Math.round((right / Math.max(1, results.length)) * 100), label: "Grammar · warm-up" });
    go({ kind: "warmup-done", right, total: results.length });
  };

  if (error) return <div className="mx-auto max-w-3xl px-4 py-20 text-center text-ink-2">The grammar lessons couldn’t be loaded. Check your connection and try again.</div>;

  const nextOf = (lesson: Lesson) => order.find((l) => l.n === lesson.n + 1);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 md:pt-14">
      <AnimatePresence mode="wait">
        {view.kind === "lesson" ? (
          <motion.div key={`lesson-${view.lesson.id}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <LessonPlayer
              lesson={view.lesson}
              stat={stats.get(view.lesson.id)}
              onExit={() => go({ kind: "home" })}
              onNext={nextOf(view.lesson) ? () => open(nextOf(view.lesson)!.id) : undefined}
            />
          </motion.div>
        ) : view.kind === "warmup" ? (
          <motion.div key="warmup" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="mx-auto max-w-2xl">
            <button onClick={() => go({ kind: "home" })} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
              <ArrowLeft size={16} /> Grammar
            </button>
            <ExerciseRunner items={view.items} onDone={warmupDone} />
          </motion.div>
        ) : view.kind === "warmup-done" ? (
          <motion.div key="warmup-done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-md py-10 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-good text-white">
              <Flame size={36} />
            </div>
            <h2 className="mt-6 font-display text-4xl">Warmed up</h2>
            <p className="mt-2 text-ink-2">
              {view.right} of {view.total} right. The ones you fixed won’t come back; the others will, until you get them right.
            </p>
            <Button size="lg" className="mt-8" onClick={() => go({ kind: "home" })}>
              Back to Grammar
            </Button>
          </motion.div>
        ) : (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Home units={units} order={order} stats={stats} misses={misses.length} opening={opening} onOpen={open} onWarmup={startWarmup} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Home({
  units,
  order,
  stats,
  misses,
  opening,
  onOpen,
  onWarmup,
}: {
  units: Unit[] | null;
  order: LessonInfo[];
  stats: Map<string, LessonStat>;
  misses: number;
  opening: string | null;
  onOpen: (id: string) => void;
  onWarmup: () => void;
}) {
  const done = order.filter((l) => stats.get(l.id)?.done).length;
  const next = order.find((l) => !stats.get(l.id)?.done);
  const doneToday = order.filter((l) => stats.get(l.id)?.doneOn === today());
  const nextUnit = units?.find((u) => u.lessons.some((l) => l.id === next?.id));

  return (
    <>
      <div className="text-[13px] font-semibold uppercase tracking-[0.22em] text-accent">Grammar</div>
      <h1 className="mt-3 font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[1] tracking-tight">One lesson a day</h1>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ink-2">
        {order.length || 56} short lessons in the order of Wren &amp; Martin, from the first rule to the last. Learn the rule, fix the common mistakes, then say it out loud.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-[1.4fr_1fr]">
        {!units ? (
          <Skeleton className="h-52 rounded-[32px]" />
        ) : next ? (
          <motion.button
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onOpen(next.id)}
            className="relative overflow-hidden rounded-[32px] bg-ink p-6 text-left text-paper sm:p-7"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/30 blur-3xl" />
            <div className="relative text-sm opacity-70">
              {doneToday.length ? "Today’s lesson is done ✓  Next up" : "Today’s lesson"} · {nextUnit?.title}
            </div>
            <div className="relative mt-2 font-display text-[clamp(1.8rem,4vw,2.5rem)] leading-tight">
              {next.n}. {next.title}
            </div>
            <div className="relative mt-1 text-sm opacity-70">{next.goal}</div>
            <span className="relative mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-paper px-5 text-sm font-medium text-ink">
              {opening === next.id ? <Spinner className="h-4 w-4" /> : <Play size={15} fill="currentColor" />}
              {doneToday.length ? "Keep going" : stats.get(next.id)?.tries ? "Try again" : "Start"}
            </span>
          </motion.button>
        ) : (
          <div className="rounded-[32px] bg-good p-7 text-white">
            <div className="font-display text-3xl">Course complete!</div>
            <p className="mt-2 opacity-90">You’ve finished every lesson. Keep your warm-ups going and practise any lesson again.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          <div className="flex flex-col justify-center rounded-3xl border border-line bg-card px-4 py-3">
            <div className="font-display text-3xl leading-none tabular-nums text-good">
              {done}
              <span className="text-lg text-ink-3"> / {order.length || "…"}</span>
            </div>
            <div className="mt-1 text-xs text-ink-3">lessons done</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full rounded-full bg-good" style={{ width: `${order.length ? (done / order.length) * 100 : 0}%` }} />
            </div>
          </div>
          <button
            onClick={onWarmup}
            disabled={!misses || opening === "warmup"}
            className="group flex flex-col justify-center rounded-3xl border border-line bg-card px-4 py-3 text-left transition enabled:hover:border-ink-3 disabled:cursor-default"
          >
            <div className="flex items-center gap-2 font-display text-3xl leading-none tabular-nums text-bad">
              {misses}
              {misses > 0 && (opening === "warmup" ? <Spinner className="h-4 w-4" /> : <ArrowRight size={18} className="text-ink-3 transition group-hover:translate-x-0.5" />)}
            </div>
            <div className="mt-1 text-xs text-ink-3">{misses ? `to review · warm-up of ${Math.min(misses, WARMUP_SIZE)}` : "nothing to review yet"}</div>
          </button>
        </div>
      </div>

      <h2 className="mt-12 font-display text-2xl">All lessons</h2>
      <div className="mt-4 space-y-3">
        {!units && Array.from({ length: 4 }, (_, k) => <Skeleton key={k} className="h-20 rounded-3xl" />)}
        {units?.map((u) => (
          <UnitCard key={u.n} unit={u} order={order} stats={stats} opening={opening} onOpen={onOpen} startOpen={u.n === nextUnit?.n} />
        ))}
      </div>
    </>
  );
}

function UnitCard({
  unit,
  order,
  stats,
  opening,
  onOpen,
  startOpen,
}: {
  unit: Unit;
  order: LessonInfo[];
  stats: Map<string, LessonStat>;
  opening: string | null;
  onOpen: (id: string) => void;
  startOpen: boolean;
}) {
  const [openState, setOpen] = useState<boolean | null>(null);
  const open = openState ?? startOpen;
  const [peek, setPeek] = useState<string | null>(null);
  const done = unit.lessons.filter((l) => stats.get(l.id)?.done).length;
  const complete = done === unit.lessons.length;
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-4 p-4 text-left sm:p-5">
        <span className={clsx("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-display text-lg", complete ? "bg-good text-white" : "bg-accent-soft text-accent")}>
          {complete ? <Check size={20} strokeWidth={3} /> : unit.n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{unit.title}</span>
          <span className="block truncate text-sm text-ink-3">{unit.note}</span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-ink-3">
          {done}/{unit.lessons.length}
        </span>
        <ChevronDown size={18} className={clsx("shrink-0 text-ink-3 transition", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-line">
              {unit.lessons.map((l) => {
                const s = stats.get(l.id);
                const unlocked = isUnlocked(l.n, order, stats);
                return (
                  <div key={l.id} className="border-b border-line last:border-b-0">
                    <button
                      onClick={() => (unlocked ? onOpen(l.id) : setPeek(peek === l.id ? null : l.id))}
                      className={clsx("flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-ink/[0.02] sm:px-5", !unlocked && "opacity-55")}
                    >
                      <span
                        className={clsx(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          s?.done ? "bg-good-soft text-good" : unlocked ? "bg-accent text-accent-ink" : "bg-ink/5 text-ink-3",
                        )}
                      >
                        {opening === l.id ? <Spinner className="h-3.5 w-3.5" /> : s?.done ? <Check size={15} strokeWidth={3} /> : unlocked ? l.n : <Lock size={13} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium">
                          {l.n}. {l.title}
                        </span>
                        <span className="block truncate text-[13px] text-ink-3">{l.goal}</span>
                      </span>
                      {s && <span className={clsx("shrink-0 text-xs tabular-nums", s.done ? "text-good" : "text-warn")}>{s.best}%</span>}
                    </button>
                    {peek === l.id && (
                      <div className="flex flex-wrap items-center gap-3 px-4 pb-3 pl-[3.75rem] text-sm text-ink-2 sm:px-5 sm:pl-16">
                        Finish lesson {l.n - 1} first. One step at a time works best.
                        <button onClick={() => onOpen(l.id)} className="inline-flex items-center gap-1 font-medium text-accent">
                          Open anyway <ArrowRight size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
