"use client";

import clsx from "clsx";
import { ArrowRight, Lightbulb, MessagesSquare, Pencil, RotateCcw, Shuffle, Trash2 } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CoachTasks, Correction } from "@/lib/coach";
import { useCoach } from "@/lib/coach-client";
import { bumpToday, logAttempt, recordingKey, remove, saveItem, useStoredList, write, type Recording, type SavedItem } from "@/lib/store";
import { TOPIC_KINDS, TOPICS, type Topic } from "@/lib/topics";
import { formatClock, useSpeechCapture } from "@/lib/useSpeechCapture";
import { AudioPlayback, BetterWords, CoachNotice, Corrections, ScoreRing, SectionLabel, SpeakButton } from "../coach/Feedback";
import { MicButton } from "../coach/MicButton";
import { Button, Chip, Skeleton } from "../ui";

const DURATIONS = [30, 60, 90];
const PHRASES = {
  Start: ["I’d like to talk about…", "In my opinion…", "For me, the most important thing is…"],
  Connect: ["For example…", "On the other hand…", "Another reason is…", "That’s why…"],
  Finish: ["To sum up…", "So overall, I believe…", "That’s what I’ve learned from…"],
};

// A random first topic, picked once in the browser (the server always renders the first one).
const firstPick = typeof window === "undefined" ? 0 : Math.floor(Math.random() * TOPICS.length);
const noSubscribe = () => () => {};

export function SpeakView() {
  const [kind, setKind] = useState("All");
  const firstIndex = useSyncExternalStore(noSubscribe, () => firstPick, () => 0);
  const [chosen, setChosen] = useState<Topic | null>(null);
  const topic = chosen ?? TOPICS[firstIndex];
  const [custom, setCustom] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(60);
  const [input, setInput] = useState<CoachTasks["topic"]["input"] | null>(null);
  const coach = useCoach("topic", input, { auto: true });
  const [savedList] = useStoredList<SavedItem>("saved:grammar-");
  const savedTexts = useMemo(() => new Set(savedList.map((s) => s.text)), [savedList]);

  const topicText = custom ?? topic.text;
  const latest = useRef(topicText);
  useEffect(() => {
    latest.current = topicText;
  });

  const cap = useSpeechCapture({
    saveAudio: true,
    onFinish: ({ transcript, elapsed, audio }) => {
      if (transcript.split(/\s+/).filter(Boolean).length < 10) return;
      const secs = Math.round(elapsed / 1000);
      setInput({ topic: latest.current, transcript, seconds: secs });
      const id = `${Date.now()}`;
      write<Recording>(recordingKey(id), { id, kind: "topic", title: latest.current, createdAt: Date.now(), durationMs: elapsed, transcript, audio: audio ?? undefined });
      bumpToday("spoken", secs);
    },
  });

  const shuffle = () => {
    const pool = TOPICS.filter((t) => (kind === "All" || t.kind === kind) && t.text !== topic.text);
    setChosen(pool[Math.floor(Math.random() * pool.length)]);
    setCustom(null);
    cap.reset();
    setInput(null);
  };

  // Stop automatically when time is up.
  const { state: capState, elapsed: capElapsed, stop: capStop } = cap;
  useEffect(() => {
    if (capState === "listening" && capElapsed >= seconds * 1000) capStop();
  }, [capState, capElapsed, seconds, capStop]);

  const words = cap.transcript.split(/\s+/).filter(Boolean).length;

  const saveCorrection = (c: Correction) => saveItem({ kind: "grammar", text: c.better, note: c.why, detail: { youSaid: c.youSaid } });
  const busy = cap.state === "listening" || cap.state === "stopping";
  const progress = Math.min(1, cap.elapsed / (seconds * 1000));
  const d = coach.data;
  // Keep each scored answer for the Progress page.
  const loggedFor = useRef<unknown>(null);
  useEffect(() => {
    if (!d || loggedFor.current === d) return;
    loggedFor.current = d;
    const s = d.scores;
    logAttempt({ kind: "topic", score: Math.round(((s.grammar + s.vocabulary + s.structure + s.fluency) / 4) * 10), seconds: input?.seconds, detail: s, label: input?.topic });
  }, [d, input]);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 md:pt-14">
      <div className="text-[13px] font-semibold uppercase tracking-[0.22em] text-accent">Speaking practice</div>
      <h1 className="mt-3 font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[1] tracking-tight">Speak on a topic</h1>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ink-2">Talk for a minute, the way you would in a real conversation. Then see your grammar fixes, better words, and how to structure your answer.</p>

      <Link href="/talk" className="group mt-6 flex items-center gap-4 rounded-3xl border border-line bg-card p-4 transition hover:border-ink-3 hover:shadow-soft">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <MessagesSquare size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Talk with a character</span>
          <span className="block text-sm text-ink-3">A real back-and-forth conversation with Siddhartha, Socrates, Alice and others</span>
        </span>
        <ArrowRight size={18} className="text-accent transition group-hover:translate-x-0.5" />
      </Link>

      {!busy && cap.state !== "done" && (
        <div className="no-scrollbar -mx-4 mt-8 flex gap-2 overflow-x-auto px-4">
          {TOPIC_KINDS.map((k) => (
            <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
              {k}
            </Chip>
          ))}
        </div>
      )}

      <motion.div layout className="relative mt-5 overflow-hidden rounded-[32px] border border-line bg-card p-6 shadow-soft sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">{custom ? "Your topic" : topic.kind}</span>
            {!busy && (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setCustom(custom ?? "")}>
                  Own topic
                </Button>
                <Button size="sm" variant="ghost" icon={<Shuffle size={14} />} onClick={shuffle}>
                  New topic
                </Button>
              </div>
            )}
          </div>

          {custom !== null && !busy && cap.state !== "done" ? (
            <textarea
              autoFocus
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Type any topic you want to talk about…"
              rows={2}
              className="mt-5 w-full resize-none bg-transparent font-display text-[clamp(1.5rem,3.5vw,2.25rem)] leading-tight outline-none placeholder:text-ink-3"
            />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={topicText} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-5 font-display text-[clamp(1.6rem,3.8vw,2.5rem)] leading-[1.12] tracking-tight [text-wrap:balance]">
                {topicText}
              </motion.div>
            </AnimatePresence>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-6">
            <div className="relative">
              <svg width={112} height={112} className="-rotate-90">
                <circle cx={56} cy={56} r={50} stroke="currentColor" strokeWidth={5} className="text-ink/10" fill="none" />
                <circle cx={56} cy={56} r={50} stroke="var(--accent)" strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray={314} strokeDashoffset={314 * (1 - progress)} className="transition-[stroke-dashoffset] duration-300" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <MicButton state={cap.state === "done" || cap.state === "error" ? "idle" : cap.state} onStart={() => { setInput(null); cap.start(); }} onStop={cap.stop} size={80} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              {busy ? (
                <>
                  <div className="font-display text-4xl tabular-nums">{formatClock(Math.max(0, seconds * 1000 - cap.elapsed))}</div>
                  <div className="text-sm text-ink-3">left · press stop when you finish</div>
                </>
              ) : (
                <>
                  <div className="text-sm font-medium">How long?</div>
                  <div className="mt-2 flex gap-2">
                    {DURATIONS.map((s) => (
                      <Chip key={s} active={seconds === s} onClick={() => setSeconds(s)}>
                        {s} sec
                      </Chip>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {busy && (
            <div className="mt-6 min-h-16 text-[16px] leading-relaxed text-ink-2">
              {cap.transcript} <span className="text-ink-3">{cap.interim}</span>
            </div>
          )}
          {cap.error && <div className="mt-5 rounded-2xl bg-bad-soft p-3.5 text-sm">{cap.error}</div>}
        </div>
      </motion.div>

      {!busy && cap.state !== "done" && (
        <div className="mt-6 rounded-[28px] border border-dashed border-line p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Lightbulb size={16} className="text-accent-2" /> Plan in 10 seconds: an opening, two points with an example, and a closing line.
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {Object.entries(PHRASES).map(([k, list]) => (
              <div key={k}>
                <SectionLabel>{k}</SectionLabel>
                <ul className="space-y-1 text-sm text-ink-2">
                  {list.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {cap.state === "done" && (
        <div className="mt-8 space-y-7">
          {words < 10 ? (
            <div className="rounded-2xl bg-warn-soft p-4 text-sm">I only heard {words} words. Try to speak for the whole time. Start with “I’d like to talk about…”.</div>
          ) : (
            <>
              <div>
                <SectionLabel>What you said · {formatClock(cap.elapsed)}</SectionLabel>
                <div className="rounded-3xl bg-paper-2 p-4 text-[16px] leading-relaxed text-ink-2">{cap.transcript}</div>
              </div>
              {cap.audio && <AudioPlayback blob={cap.audio} />}
            </>
          )}

          {coach.loading && (
            <div className="space-y-3">
              <div className="text-sm text-ink-3">Listening back to your answer…</div>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
          {coach.error && <CoachNotice error={coach.error} onRetry={() => coach.run()} />}

          {d && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-7">
              <div className="rounded-[28px] border border-line bg-card p-5">
                <div className="grid grid-cols-4 gap-2">
                  <ScoreRing value={d.scores.grammar} max={10} label="Grammar" size={68} />
                  <ScoreRing value={d.scores.vocabulary} max={10} label="Words" size={68} />
                  <ScoreRing value={d.scores.structure} max={10} label="Structure" size={68} />
                  <ScoreRing value={d.scores.fluency} max={10} label="Fluency" size={68} />
                </div>
                <p className="mt-5 text-[16px] leading-relaxed">{d.overall}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Opening", d.opening],
                  ["Flow", d.flow],
                  ["Closing", d.closing],
                ].map(([label, body]) => (
                  <div key={label} className="rounded-3xl bg-paper-2 p-4">
                    <SectionLabel>{label}</SectionLabel>
                    <p className="text-sm leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>

              <div>
                <SectionLabel>Grammar fixes</SectionLabel>
                <Corrections items={d.corrections} onSave={saveCorrection} savedIds={savedTexts} />
              </div>

              {d.betterWords.length > 0 && (
                <div>
                  <SectionLabel>Better words</SectionLabel>
                  <BetterWords items={d.betterWords} />
                </div>
              )}

              {d.fillers.length > 0 && (
                <div>
                  <SectionLabel>Filler words</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {d.fillers.map((f) => (
                      <span key={f.word} className="rounded-full bg-warn-soft px-3 py-1.5 text-sm text-warn">
                        “{f.word}” × {f.count}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-ink-3">Instead of a filler, take a short, silent pause. It sounds more confident.</p>
                </div>
              )}

              <div className="rounded-[28px] bg-ink p-5 text-paper">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-60">How a fluent speaker might say it</div>
                <p className="mt-2 font-reading text-[17px] leading-relaxed">{d.polishedVersion}</p>
                <div className="mt-4 [&_button]:bg-paper [&_button]:text-ink">
                  <SpeakButton text={d.polishedVersion} label="Listen, then say it yourself" />
                </div>
              </div>

              <div className="rounded-2xl bg-accent-soft p-4 text-[15px]">
                <b className="text-accent">Next time:</b> {d.nextTime}
              </div>
            </motion.div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button icon={<RotateCcw size={15} />} onClick={() => { setInput(null); cap.start(); }}>
              Try the same topic again
            </Button>
            <Button variant="outline" icon={<Shuffle size={15} />} onClick={shuffle}>
              New topic
            </Button>
          </div>
        </div>
      )}

      <History />
    </div>
  );
}

function History() {
  const [recs] = useStoredList<Recording>("rec:");
  const [open, setOpen] = useState<string | null>(null);
  const list = recs.sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
  if (!list.length) return null;
  return (
    <section className="mt-16">
      <h2 className="font-display text-2xl">Your recordings</h2>
      <p className="mt-1 text-sm text-ink-3">Listen to old attempts to hear how much you’ve improved.</p>
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
        {list.map((r) => (
          <li key={r.id}>
            <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-ink/[0.03]">
              <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", r.kind === "topic" ? "bg-accent-soft text-accent" : r.kind === "read" ? "bg-good-soft text-good" : "bg-warn-soft text-warn")}>
                {r.kind === "topic" ? "Topic" : r.kind === "read" ? "Reading" : "Retell"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px]">{r.title}</span>
              {typeof r.score === "number" && <span className="text-sm tabular-nums text-ink-2">{r.score}%</span>}
              <span className="text-xs tabular-nums text-ink-3">{formatClock(r.durationMs)}</span>
            </button>
            {open === r.id && (
              <div className="space-y-3 px-4 pb-4">
                <div className="text-xs text-ink-3">{new Date(r.createdAt).toLocaleString()}</div>
                {r.audio ? <AudioPlayback blob={r.audio} label="Recording" /> : <div className="text-xs text-ink-3">No audio saved for this attempt.</div>}
                <p className="text-sm leading-relaxed text-ink-2">{r.transcript}</p>
                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(recordingKey(r.id))}>
                  Delete
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
