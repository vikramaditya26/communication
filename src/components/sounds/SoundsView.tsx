"use client";

import clsx from "clsx";
import { ArrowLeft, Check, Ear, Mic, RotateCcw, Volume2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CONTRASTS, drillKey, emptyStats, pct, type Contrast, type DrillStats } from "@/lib/sounds";
import { listenOnce, loadVoices, speak, speechRecognitionSupported, wordsMatch } from "@/lib/speech";
import { bumpToday, logAttempt, read, useStored, write } from "@/lib/store";
import { SectionLabel } from "../coach/Feedback";
import { Button } from "../ui";

const ROUNDS = 10;
type Mode = "listen" | "say";
type Question = { pair: [string, string]; side: 0 | 1 };
type Answer = { q: Question; right: boolean; heard?: string };

const say = (word: string, rate = 0.8) => loadVoices().then(() => speak(word, { rate }));
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeQuestions(c: Contrast, stats?: DrillStats): Question[] {
  // Words you got wrong before come up more often.
  const weighted = c.pairs.flatMap((pair) => {
    const misses = pair.reduce((n, w) => n + (stats?.words[w]?.wrong ?? 0), 0);
    return Array.from({ length: 1 + Math.min(3, misses) }, () => pair);
  });
  return Array.from({ length: ROUNDS }, () => ({ pair: weighted[Math.floor(Math.random() * weighted.length)], side: (Math.random() < 0.5 ? 0 : 1) as 0 | 1 }));
}

async function recordAnswer(c: Contrast, mode: Mode, word: string, right: boolean) {
  const cur = (await read<DrillStats>(drillKey(c.id))) ?? emptyStats();
  const w = cur.words[word] ?? { right: 0, wrong: 0 };
  await write<DrillStats>(drillKey(c.id), {
    ...cur,
    [mode]: { right: cur[mode].right + (right ? 1 : 0), total: cur[mode].total + 1 },
    words: { ...cur.words, [word]: { right: w.right + (right ? 1 : 0), wrong: w.wrong + (right ? 0 : 1) } },
    last: Date.now(),
  });
}

export function SoundsView() {
  const [open, setOpen] = useState<Contrast | null>(null);
  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 md:pt-14">
      <AnimatePresence mode="wait">
        {open ? (
          <motion.div key={open.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Drill c={open} onBack={() => setOpen(null)} />
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            <div className="text-[13px] font-semibold uppercase tracking-[0.22em] text-accent">Pronunciation drills</div>
            <h1 className="mt-3 font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[1] tracking-tight">Sounds</h1>
            <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ink-2">
              Short games for the sound pairs that Indian English speakers most often mix up. First train your ear, then your mouth.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CONTRASTS.map((c, i) => (
                <ContrastCard key={c.id} c={c} index={i} onOpen={() => setOpen(c)} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ContrastCard({ c, index, onOpen }: { c: Contrast; index: number; onOpen: () => void }) {
  const [stats] = useStored<DrillStats>(drillKey(c.id));
  const listen = stats ? pct(stats.listen) : null;
  const speakScore = stats ? pct(stats.say) : null;
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      className="group relative overflow-hidden rounded-[28px] border border-line bg-card p-5 text-left shadow-soft transition-shadow hover:shadow-lift"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-accent/10 blur-2xl transition group-hover:bg-accent/20" />
      <div className="relative flex items-baseline gap-2 font-display text-5xl tracking-tight">
        <span>{c.a}</span>
        <span className="text-2xl text-ink-3">/</span>
        <span className="text-accent">{c.b}</span>
      </div>
      <div className="relative mt-3 font-medium">{c.title}</div>
      <div className="relative mt-1 text-sm text-ink-3">
        {c.pairs[0][0]} · {c.pairs[0][1]}
      </div>
      <div className="relative mt-5 space-y-2">
        <Meter label="Ear" value={listen} />
        <Meter label="Mouth" value={speakScore} />
      </div>
    </motion.button>
  );
}

function Meter({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-11 text-ink-3">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
        <motion.div
          className={clsx("h-full rounded-full", value === null ? "bg-transparent" : value >= 85 ? "bg-good" : value >= 60 ? "bg-warn" : "bg-bad")}
          initial={{ width: 0 }}
          animate={{ width: `${value ?? 0}%` }}
        />
      </div>
      <span className="w-9 text-right tabular-nums text-ink-3">{value === null ? "new" : `${value}%`}</span>
    </div>
  );
}

function Drill({ c, onBack }: { c: Contrast; onBack: () => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [stats] = useStored<DrillStats>(drillKey(c.id));

  return (
    <div>
      <button onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} /> All sounds
      </button>
      <div className="flex items-baseline gap-3 font-display text-6xl tracking-tight">
        {c.a} <span className="text-3xl text-ink-3">/</span> <span className="text-accent">{c.b}</span>
      </div>
      <h1 className="mt-2 font-display text-3xl">{c.title}</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">{c.why}</p>

      {mode ? (
        <Round key={mode} c={c} mode={mode} stats={stats} onExit={() => setMode(null)} />
      ) : (
        <>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {[
              [c.a, c.tipA],
              [c.b, c.tipB],
            ].map(([label, tip], i) => (
              <div key={label} className="rounded-3xl border border-line bg-card p-5">
                <div className={clsx("font-display text-3xl", i === 1 && "text-accent")}>{label}</div>
                <p className="mt-2 text-[15px] leading-relaxed">{capitalize(tip.split(": ").slice(1).join(": "))}</p>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <SectionLabel>Hear the difference · tap a pair</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {c.pairs.map(([a, b]) => (
                <button
                  key={a}
                  onClick={async () => {
                    say(a);
                    await sleep(1100);
                    say(b);
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-[15px] transition hover:border-ink-3 active:scale-95"
                >
                  <Volume2 size={14} className="text-ink-3" />
                  {a} <span className="text-ink-3">·</span> <span className="text-accent">{b}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <ModeCard icon={<Ear size={22} />} title="Listen and choose" text="Hear a word and pick which one it was. Training your ear comes first." score={stats ? pct(stats.listen) : null} onClick={() => setMode("listen")} />
            <ModeCard
              icon={<Mic size={22} />}
              title="Say it"
              text="Say the word you see. The app checks which word it heard."
              score={stats ? pct(stats.say) : null}
              onClick={() => setMode("say")}
              disabled={!speechRecognitionSupported()}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ModeCard({ icon, title, text, score, onClick, disabled }: { icon: React.ReactNode; title: string; text: string; score: number | null; onClick: () => void; disabled?: boolean }) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -3 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-4 rounded-3xl bg-ink p-5 text-left text-paper disabled:opacity-50"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-paper/10">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-medium">{title}</span>
        <span className="mt-1 block text-sm opacity-70">{disabled ? "Needs Google Chrome for the microphone." : text}</span>
        {score !== null && <span className="mt-2 block text-xs opacity-60">Best so far: {score}% overall</span>}
      </span>
    </motion.button>
  );
}

function Round({ c, mode, stats, onExit }: { c: Contrast; mode: Mode; stats?: DrillStats; onExit: () => void }) {
  const [questions, setQuestions] = useState(() => makeQuestions(c, stats));
  const [n, setN] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [listening, setListening] = useState(false);
  const logged = useRef(false);
  const q = questions[n];
  const answered = answers.length > n ? answers[n] : null;
  const done = n >= ROUNDS;
  const target = q ? q.pair[q.side] : "";
  const other = q ? q.pair[1 - q.side] : "";

  // Listening mode: play the word as each question appears.
  useEffect(() => {
    if (mode === "listen" && q && !answered) {
      const t = setTimeout(() => say(target), 350);
      return () => clearTimeout(t);
    }
  }, [mode, q, answered, target]);

  const answer = useCallback(
    (right: boolean, heard?: string) => {
      setAnswers((a) => [...a, { q, right, heard }]);
      recordAnswer(c, mode, target, right);
      // Right answers move on by themselves.
      if (right) setTimeout(() => setN((x) => x + 1), mode === "listen" ? 700 : 1100);
    },
    [c, mode, q, target],
  );

  const sayIt = async () => {
    setListening(true);
    const heard = await listenOnce(4000);
    setListening(false);
    const words = heard.split(/\s+/);
    const right = words.some((w) => wordsMatch(w, target));
    answer(right, heard);
    bumpToday("spoken", 3);
  };

  useEffect(() => {
    if (!done || logged.current) return;
    logged.current = true;
    const right = answers.filter((a) => a.right).length;
    logAttempt({ kind: "drill", score: Math.round((right / ROUNDS) * 100), label: `${c.title} · ${mode === "listen" ? "listen" : "say"}` });
  }, [done, answers, c.title, mode]);

  if (done) {
    const right = answers.filter((a) => a.right).length;
    const wrong = answers.filter((a) => !a.right);
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="mt-8 rounded-[32px] border border-line bg-card p-6 sm:p-8">
        <div className="font-display text-6xl tabular-nums">
          {right}
          <span className="text-2xl text-ink-3"> / {ROUNDS}</span>
        </div>
        <div className="mt-2 text-ink-2">{right === ROUNDS ? "A perfect round." : right >= 8 ? "Very good. A couple more rounds and it will feel natural." : "Keep going. Listen to the pairs again, then try another round."}</div>
        {wrong.length > 0 && (
          <div className="mt-6">
            <SectionLabel>Listen to these again</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {wrong.map((a, i) => (
                <button key={i} onClick={() => say(a.q.pair[a.q.side])} className="inline-flex items-center gap-2 rounded-full bg-bad-soft px-3.5 py-1.5 text-sm text-bad">
                  <Volume2 size={14} /> {a.q.pair[a.q.side]}
                  {a.heard !== undefined && <span className="opacity-70">· heard “{a.heard || "nothing"}”</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-8 flex flex-wrap gap-2">
          <Button
            icon={<RotateCcw size={15} />}
            onClick={() => {
              logged.current = false;
              setQuestions(makeQuestions(c, stats));
              setAnswers([]);
              setN(0);
            }}
          >
            Another round
          </Button>
          <Button variant="outline" onClick={onExit}>
            Done
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="mt-8">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex flex-1 gap-1">
          {Array.from({ length: ROUNDS }, (_, i) => (
            <div
              key={i}
              className={clsx("h-1.5 flex-1 rounded-full transition-colors", answers[i] ? (answers[i].right ? "bg-good" : "bg-bad") : i === n ? "bg-accent" : "bg-ink/10")}
            />
          ))}
        </div>
        <button onClick={onExit} className="text-sm font-medium text-ink-2 hover:text-ink">
          Stop
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={n} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }} className="rounded-[32px] border border-line bg-card p-6 text-center sm:p-10">
          {mode === "listen" ? (
            <>
              <div className="text-sm text-ink-3">Which word did you hear?</div>
              <button onClick={() => say(target)} className="mx-auto mt-5 flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lift active:scale-95" aria-label="Play again">
                <Volume2 size={32} />
              </button>
              <div className="mt-8 grid grid-cols-2 gap-3">
                {q.pair.map((w, side) => {
                  const isTarget = side === q.side;
                  const state = answered ? (isTarget ? "right" : "dim") : "open";
                  return (
                    <motion.button
                      key={w}
                      whileTap={{ scale: 0.96 }}
                      disabled={Boolean(answered)}
                      onClick={() => answer(isTarget)}
                      className={clsx(
                        "rounded-3xl border-2 px-4 py-6 font-display text-3xl transition",
                        state === "open" && "border-line hover:border-ink-3",
                        state === "right" && "border-good bg-good-soft text-good",
                        state === "dim" && "border-line opacity-40",
                      )}
                    >
                      {w}
                      <span className="mt-1 block font-sans text-xs uppercase tracking-wider text-ink-3">{side === 0 ? c.a : c.b}</span>
                    </motion.button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-ink-3">Say this word</div>
              <div className="mt-3 font-display text-[clamp(3rem,10vw,5rem)] leading-none">{target}</div>
              <div className="mt-2 text-xs uppercase tracking-wider text-ink-3">
                {q.side === 0 ? c.a : c.b} sound · not “{other}”
              </div>
              <div className="mt-6 flex items-center justify-center gap-3">
                <button onClick={() => say(target)} className="flex h-12 w-12 items-center justify-center rounded-full border border-line active:scale-95" aria-label="Hear it">
                  <Volume2 size={20} />
                </button>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={listening || answered ? undefined : sayIt}
                  className={clsx("flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lift", listening ? "recording-pulse bg-bad" : "bg-accent", answered && "opacity-40")}
                  aria-label="Say it"
                >
                  <Mic size={30} />
                </motion.button>
                <span className="w-12" />
              </div>
              <div className="mt-3 h-5 text-sm text-ink-3">{listening ? "Listening…" : ""}</div>
            </>
          )}

          <AnimatePresence>
            {answered && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={clsx("mt-6 rounded-2xl p-4 text-left text-[15px]", answered.right ? "bg-good-soft" : "bg-bad-soft")}>
                <div className="flex items-center gap-2 font-medium">
                  {answered.right ? <Check size={18} className="text-good" /> : <X size={18} className="text-bad" />}
                  {answered.right
                    ? "Right!"
                    : mode === "listen"
                      ? `It was “${target}”.`
                      : answered.heard && answered.heard.split(/\s+/).some((w) => wordsMatch(w, other))
                        ? `That sounded like “${other}”.`
                        : answered.heard
                          ? `I heard “${answered.heard}”.`
                          : "I didn’t hear anything."}
                </div>
                {!answered.right && (
                  <>
                    <p className="mt-2 text-sm text-ink-2">{q.side === 0 ? c.tipA : c.tipB}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" icon={<Volume2 size={14} />} onClick={() => say(target)}>
                        {target}
                      </Button>
                      <Button size="sm" variant="outline" icon={<Volume2 size={14} />} onClick={() => say(other)}>
                        {other}
                      </Button>
                      <Button size="sm" onClick={() => setN((x) => x + 1)} className="ml-auto">
                        Next
                      </Button>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
