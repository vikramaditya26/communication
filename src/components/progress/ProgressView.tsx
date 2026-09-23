"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp, Bookmark, BookmarkCheck, Clock, Flame, Layers, Minus, Sparkles, Trophy, Volume2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo } from "react";
import { CONTRASTS, pct, type DrillStats } from "@/lib/sounds";
import { speak } from "@/lib/speech";
import { isActiveDay, saveItem, savedId, streakOf, useDays, useEntries, useStoredList, type Attempt, type AttemptKind, type Miss, type SavedItem } from "@/lib/store";
import { EmptyState } from "../ui";
import { useNow } from "@/lib/useNow";
import { DataSection } from "./DataSection";

const KIND: Record<AttemptKind, { label: string; style: string }> = {
  read: { label: "Read aloud", style: "bg-good-soft text-good" },
  shadow: { label: "Shadowing", style: "bg-accent-soft text-accent" },
  drill: { label: "Sounds", style: "bg-warn-soft text-warn" },
  topic: { label: "Speaking", style: "bg-bad-soft text-bad" },
  retell: { label: "Retell", style: "bg-ink/5 text-ink-2" },
  chat: { label: "Conversation", style: "bg-ink/5 text-ink-2" },
};

const dayOf = (t: number) => new Date(t).toLocaleDateString("en-CA");
const shortDate = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function ProgressView() {
  const days = useDays(365);
  const [attempts, loaded] = useStoredList<Attempt>("attempt:");
  const [misses] = useStoredList<Miss>("miss:");
  const [saved] = useStoredList<SavedItem>("saved:");
  const drills = useEntries<DrillStats>("drill:");

  const streak = streakOf(days);
  const best = useMemo(() => {
    let run = 0, max = 0;
    for (const d of [...days].reverse()) {
      run = isActiveDay(d.day) ? run + 1 : 0;
      max = Math.max(max, run);
    }
    return max;
  }, [days]);
  const totals = useMemo(() => days.reduce((t, d) => ({ pages: t.pages + d.day.pages, spoken: t.spoken + d.day.spoken }), { pages: 0, spoken: 0 }), [days]);

  const now = useNow();
  const sorted = useMemo(() => [...attempts].sort((a, b) => a.at - b.at), [attempts]);

  // Daily average of clear words (reading aloud and shadowing) for the last 30 days.
  const clarity = useMemo(() => {
    const byDay = new Map<string, number[]>();
    for (const a of sorted) {
      if ((a.kind === "read" || a.kind === "shadow") && Number.isFinite(a.score) && now - a.at < 30 * 86_400_000) {
        const k = dayOf(a.at);
        byDay.set(k, [...(byDay.get(k) ?? []), a.score as number]);
      }
    }
    return [...byDay.entries()].map(([date, s]) => ({ date, value: Math.round(s.reduce((x, y) => x + y, 0) / s.length) }));
  }, [sorted, now]);

  const topics = sorted.filter((a) => a.kind === "topic" && a.detail);
  const hardWords = [...misses].sort((a, b) => b.count - a.count || b.last - a.last).slice(0, 18);
  const savedSounds = new Set(saved.filter((s) => s.kind === "sound").map((s) => s.id));
  const recent = [...sorted].reverse().slice(0, 12);
  const minutes14 = days.slice(0, 14).reverse();

  const empty = loaded && !attempts.length && !totals.pages;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 md:pt-14">
      <div className="text-[13px] font-semibold uppercase tracking-[0.22em] text-accent">How you’re doing</div>
      <h1 className="mt-3 font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[1] tracking-tight">Progress</h1>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<Flame size={20} className="text-accent" />} value={streak} label="Day streak" sub={`Best: ${best}`} />
        <Tile icon={<Sparkles size={20} className="text-accent-2" />} value={totals.pages} label="Pages read" />
        <Tile icon={<Clock size={20} className="text-good" />} value={Math.round(totals.spoken / 60)} label="Minutes spoken" />
        <Tile icon={<Layers size={20} className="text-ink-2" />} value={saved.length} label="Words & fixes saved" />
      </div>

      {empty ? (
        <EmptyState icon={<Trophy size={24} />} title="Nothing to show yet">
          Read a page out loud, shadow a few sentences or play a sound drill. Your scores will appear here.
          <div className="mt-5">
            <Link href="/" className="font-medium text-accent hover:underline">
              Open the library
            </Link>
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card title="Clear words when reading" note="Daily average from reading aloud and shadowing">
              {clarity.length ? <LineChart points={clarity} /> : <Hint>Read a page out loud to start this chart.</Hint>}
            </Card>
            <Card title="Minutes spoken" note="Last 14 days">
              <Bars data={minutes14.map((d) => ({ label: d.date, value: Math.round(d.day.spoken / 60) }))} />
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="Speaking scores" note="From “Speak on a topic”">
              {topics.length ? <TopicScores topics={topics} /> : <Hint>Speak on a topic to see grammar, vocabulary, structure and fluency scores.</Hint>}
            </Card>
            <Card title="Sounds" note="Ear = listening game · Mouth = saying it">
              <div className="space-y-3">
                {CONTRASTS.map((c) => {
                  const s = drills.find(([k]) => k === `drill:${c.id}`)?.[1];
                  return (
                    <div key={c.id} className="grid grid-cols-[70px_1fr_1fr] items-center gap-3 text-sm">
                      <span className="font-display text-lg">
                        {c.a}/{c.b}
                      </span>
                      <MiniBar value={s ? pct(s.listen) : null} />
                      <MiniBar value={s ? pct(s.say) : null} />
                    </div>
                  );
                })}
                <Link href="/sounds" className="inline-block pt-1 text-sm font-medium text-accent hover:underline">
                  Practice sounds →
                </Link>
              </div>
            </Card>
          </div>

          <Card title="Words that were hard to say" note="From reading aloud and shadowing. Tap to hear, save to review." className="mt-4">
            {hardWords.length ? (
              <div className="flex flex-wrap gap-2">
                {hardWords.map((m) => {
                  const isSaved = savedSounds.has(savedId("sound", m.word));
                  return (
                    <span key={m.word} className="inline-flex items-center overflow-hidden rounded-full border border-line bg-card text-[15px]">
                      <button onClick={() => speak(m.word, { rate: 0.8 })} className="flex items-center gap-2 py-1.5 pl-3.5 pr-2 hover:bg-ink/5">
                        <Volume2 size={14} className="text-ink-3" /> {m.word}
                        <span className="rounded-full bg-bad-soft px-1.5 text-xs text-bad">{m.count}</span>
                      </button>
                      <button
                        onClick={() => !isSaved && saveItem({ kind: "sound", text: m.word, note: `Missed ${m.count} ${m.count === 1 ? "time" : "times"} when reading.` })}
                        className={clsx("border-l border-line px-2.5 py-1.5", isSaved ? "text-accent" : "text-ink-3 hover:bg-ink/5 hover:text-ink")}
                        aria-label={isSaved ? "Saved" : "Save to review"}
                      >
                        {isSaved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <Hint>No hard words yet. They’ll collect here as you read out loud.</Hint>
            )}
          </Card>

          <Card title="Recent activity" className="mt-4">
            {recent.length ? (
              <ul className="divide-y divide-line">
                {recent.map((a) => (
                  <li key={a.at} className="flex items-center gap-3 py-2.5">
                    <span className={clsx("w-[104px] shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold", KIND[a.kind].style)}>{KIND[a.kind].label}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{a.label ?? ""}</span>
                    {Number.isFinite(a.score) && <span className="text-sm tabular-nums">{a.score}%</span>}
                    <span className="w-16 shrink-0 text-right text-xs text-ink-3">{shortDate(dayOf(a.at))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Hint>Your practice sessions will be listed here.</Hint>
            )}
          </Card>
        </>
      )}

      <DataSection />
    </div>
  );
}

function Tile({ icon, value, label, sub }: { icon: React.ReactNode; value: number; label: string; sub?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-line bg-card p-4">
      {icon}
      <div className="mt-3 font-display text-4xl leading-none tabular-nums">{value.toLocaleString()}</div>
      <div className="mt-1.5 text-[13px] text-ink-3">
        {label}
        {sub && <span className="ml-1.5 text-ink-3/80">· {sub}</span>}
      </div>
    </motion.div>
  );
}

function Card({ title, note, children, className }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-[28px] border border-line bg-card p-5", className)}>
      <h2 className="font-display text-xl">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-ink-3">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const Hint = ({ children }: { children: React.ReactNode }) => <p className="py-6 text-center text-sm text-ink-3">{children}</p>;

function LineChart({ points }: { points: { date: string; value: number }[] }) {
  const W = 520, H = 180, P = 28;
  const x = (i: number) => (points.length === 1 ? W / 2 : P + (i / (points.length - 1)) * (W - P * 2));
  const y = (v: number) => H - P - (v / 100) * (H - P * 1.6);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[320px]">
        <defs>
          <linearGradient id="clarity-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--good)" stopOpacity="0.25" />
            <stop offset="1" stopColor="var(--good)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="3 4" />
            <text x={P - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--ink-3)">
              {v}
            </text>
          </g>
        ))}
        {points.length > 1 && <motion.path d={area} fill="url(#clarity-fill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />}
        {points.length > 1 && <motion.path d={path} fill="none" stroke="var(--good)" strokeWidth="2.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />}
        {points.map((p, i) => (
          <g key={p.date}>
            <circle cx={x(i)} cy={y(p.value)} r="4" fill="var(--card)" stroke="var(--good)" strokeWidth="2">
              <title>
                {shortDate(p.date)}: {p.value}%
              </title>
            </circle>
            {(i === 0 || i === points.length - 1) && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--ink-3)">
                {shortDate(p.date)}
              </text>
            )}
          </g>
        ))}
        <text x={x(points.length - 1)} y={y(points[points.length - 1].value) - 10} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--good)">
          {points[points.length - 1].value}%
        </text>
      </svg>
    </div>
  );
}

function Bars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(5, ...data.map((d) => d.value));
  return (
    <div className="flex h-[180px] items-end gap-1.5">
      {data.map((d, i) => (
        <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${shortDate(d.label)}: ${d.value} min`}>
          {d.value > 0 && <span className="text-[10px] tabular-nums text-ink-3">{d.value}</span>}
          <motion.div
            className={clsx("w-full rounded-t-md", i === data.length - 1 ? "bg-good" : "bg-good/45")}
            initial={{ height: 0 }}
            animate={{ height: `${Math.max(d.value ? 4 : 1.5, (d.value / max) * 80)}%` }}
            transition={{ delay: i * 0.02 }}
          />
          <span className="text-[10px] text-ink-3">{new Date(`${d.label}T12:00`).toLocaleDateString(undefined, { weekday: "narrow" })}</span>
        </div>
      ))}
    </div>
  );
}

function TopicScores({ topics }: { topics: Attempt[] }) {
  const keys = ["grammar", "vocabulary", "structure", "fluency"] as const;
  const latest = topics[topics.length - 1].detail!;
  const earlier = topics.slice(0, -1);
  return (
    <div className="space-y-3">
      {keys.map((k) => {
        const before = earlier.length ? earlier.reduce((n, t) => n + (t.detail?.[k] ?? 0), 0) / earlier.length : null;
        const now = latest[k] ?? 0;
        const diff = before === null ? 0 : now - before;
        return (
          <div key={k} className="grid grid-cols-[88px_1fr_52px] items-center gap-3 text-sm">
            <span className="capitalize text-ink-2">{k}</span>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10">
              <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${now * 10}%` }} />
            </div>
            <span className="flex items-center justify-end gap-1 tabular-nums">
              {now}/10
              {before !== null && (Math.abs(diff) < 0.5 ? <Minus size={12} className="text-ink-3" /> : diff > 0 ? <ArrowUp size={12} className="text-good" /> : <ArrowDown size={12} className="text-bad" />)}
            </span>
          </div>
        );
      })}
      <p className="text-xs text-ink-3">
        Latest answer{earlier.length ? `, compared with your ${earlier.length} earlier ${earlier.length === 1 ? "one" : "ones"}` : ""}.
      </p>
    </div>
  );
}

function MiniBar({ value }: { value: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
        <div className={clsx("h-full rounded-full", value === null ? "" : value >= 85 ? "bg-good" : value >= 60 ? "bg-warn" : "bg-bad")} style={{ width: `${value ?? 0}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-ink-3">{value === null ? "–" : `${value}%`}</span>
    </div>
  );
}
