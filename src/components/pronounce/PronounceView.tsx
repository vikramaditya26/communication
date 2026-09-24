"use client";

import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, Ear, Play, Search, Sparkles, Volume2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useEntries } from "@/lib/store";
import { isLearned, loadWords, pickSession, TAG_ORDER, TAGS, type Word, type WordStat } from "@/lib/words";
import { speak } from "@/lib/speech";
import { Chip, Skeleton } from "../ui";
import { WordSession } from "./WordSession";

type View = { kind: "home" } | { kind: "list"; title: string; filter: (w: Word) => boolean } | { kind: "session"; words: Word[]; back: View };

export function PronounceView() {
  const [words, setWords] = useState<Word[] | null>(null);
  const [error, setError] = useState(false);
  const entries = useEntries<WordStat>("word:");
  const stats = useMemo(() => new Map(entries.map(([k, v]) => [k.slice(5), v])), [entries]);
  const [view, setView] = useState<View>({ kind: "home" });

  useEffect(() => {
    loadWords().then(setWords, () => setError(true));
  }, []);

  const go = (v: View) => {
    setView(v);
    window.scrollTo(0, 0);
  };

  if (error) return <div className="mx-auto max-w-3xl px-4 py-20 text-center text-ink-2">The word list couldn’t be loaded. Check your connection and try again.</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 md:pt-14">
      <AnimatePresence mode="wait">
        {view.kind === "session" && words ? (
          <motion.div key="session" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <WordSession words={view.words} stats={stats} onExit={() => go(view.back)} onAgain={(ws) => go({ ...view, words: ws })} />
          </motion.div>
        ) : view.kind === "list" && words ? (
          <motion.div key={`list-${view.title}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <WordList title={view.title} words={words.filter(view.filter)} stats={stats} onBack={() => go({ kind: "home" })} onPractice={(ws) => go({ kind: "session", words: ws, back: view })} />
          </motion.div>
        ) : (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Home words={words} stats={stats} onList={(title, filter) => go({ kind: "list", title, filter })} onPractice={(ws) => go({ kind: "session", words: ws, back: { kind: "home" } })} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Home({
  words,
  stats,
  onList,
  onPractice,
}: {
  words: Word[] | null;
  stats: Map<string, WordStat>;
  onList: (title: string, filter: (w: Word) => boolean) => void;
  onPractice: (words: Word[]) => void;
}) {
  const [q, setQ] = useState("");
  const learned = words ? words.filter((w) => isLearned(stats.get(w.w))).length : 0;
  const practiced = words ? words.filter((w) => stats.has(w.w)).length : 0;
  const toFix = words ? words.filter((w) => stats.get(w.w) && !stats.get(w.w)!.lastRight).length : 0;
  const today = words ? pickSession(words, stats) : [];
  const topics = useMemo(() => {
    const map = new Map<string, number>();
    words?.forEach((w) => map.set(w.t, (map.get(w.t) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [words]);
  const results = q.trim() && words ? words.filter((w) => w.w.startsWith(q.trim().toLowerCase()) || w.m.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12) : [];

  return (
    <>
      <div className="text-[13px] font-semibold uppercase tracking-[0.22em] text-accent">Pronunciation</div>
      <h1 className="mt-3 font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[1] tracking-tight">Pronounce</h1>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ink-2">
        {words ? words.length.toLocaleString() : "Thousands of"} everyday words that are easy to say the Indian way instead of the American way. Each one has its meaning and a sentence you would really use.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <motion.button
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.98 }}
          disabled={!words}
          onClick={() => onPractice(today)}
          className="relative overflow-hidden rounded-[32px] bg-ink p-6 text-left text-paper sm:p-7"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/30 blur-3xl" />
          <div className="relative flex items-center gap-2 text-sm opacity-70">
            <Sparkles size={16} /> Today’s practice
          </div>
          <div className="relative mt-2 font-display text-4xl leading-tight">10 words</div>
          <div className="relative mt-2 line-clamp-2 text-sm opacity-70">{words ? today.map((w) => w.w).join(" · ") : "Loading…"}</div>
          <span className="relative mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-paper px-5 text-sm font-medium text-ink">
            <Play size={15} fill="currentColor" /> Start
          </span>
        </motion.button>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-1">
          <Stat value={learned} label="words learned" tone="text-good" />
          <Stat value={practiced} label="words practiced" tone="text-accent" />
          <button disabled={!toFix} onClick={() => onList("Words to fix", (w) => Boolean(stats.get(w.w) && !stats.get(w.w)!.lastRight))} className="text-left disabled:cursor-default">
            <Stat value={toFix} label="to fix" tone="text-bad" />
          </button>
        </div>
      </div>

      <label className="relative mt-8 flex h-12 items-center">
        <Search size={17} className="pointer-events-none absolute left-4 text-ink-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a word"
          className="h-full w-full rounded-full border border-line bg-card pl-11 pr-4 text-[15px] outline-none focus:border-accent"
        />
      </label>
      {results.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-3xl border border-line bg-card">
          {results.map((w) => (
            <WordRow key={w.w} w={w} stat={stats.get(w.w)} onClick={() => onPractice([w])} />
          ))}
        </div>
      )}
      {q.trim() && words && !results.length && <p className="mt-3 text-sm text-ink-3">That word isn’t in the list yet.</p>}

      <h2 className="mt-12 font-display text-2xl">By sound</h2>
      <p className="mt-1 text-sm text-ink-3">The sounds Indian English speakers most often say differently</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {TAG_ORDER.map((tag, i) => {
          const list = words?.filter((w) => w.tags.includes(tag)) ?? [];
          const done = list.filter((w) => isLearned(stats.get(w.w))).length;
          return (
            <motion.button
              key={tag}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              whileHover={{ y: -3 }}
              onClick={() => onList(TAGS[tag].label, (w) => w.tags.includes(tag))}
              className="rounded-3xl border border-line bg-card p-4 text-left transition-shadow hover:shadow-soft"
            >
              <div className="font-display text-2xl leading-none">{TAGS[tag].short}</div>
              <div className="mt-2 text-sm font-medium">{TAGS[tag].label}</div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
                <div className="h-full rounded-full bg-good" style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} />
              </div>
              <div className="mt-1.5 text-xs text-ink-3">{words ? `${done} of ${list.length} learned` : " "}</div>
            </motion.button>
          );
        })}
      </div>

      <h2 className="mt-12 font-display text-2xl">By topic</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {!words && <Skeleton className="h-9 w-full" />}
        {topics.map(([t, n]) => (
          <Chip key={t} onClick={() => onList(t, (w) => w.t === t)}>
            {t} <span className="opacity-50">{n}</span>
          </Chip>
        ))}
      </div>

      <Link href="/sounds" className="group mt-12 flex items-center gap-4 rounded-3xl border border-line p-4 transition hover:border-ink-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Ear size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Sound pair games</span>
          <span className="block text-sm text-ink-3">Train your ear: vest or west, sheep or ship</span>
        </span>
        <ArrowRight size={18} className="text-accent transition group-hover:translate-x-0.5" />
      </Link>
    </>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="flex h-full flex-col justify-center rounded-3xl border border-line bg-card px-4 py-3">
      <div className={clsx("font-display text-3xl leading-none tabular-nums", tone)}>{value.toLocaleString()}</div>
      <div className="mt-1 text-xs text-ink-3">{label}</div>
    </div>
  );
}

function WordRow({ w, stat, onClick }: { w: Word; stat?: WordStat; onClick: () => void }) {
  const state = !stat ? "new" : isLearned(stat) ? "learned" : stat.lastRight ? "ok" : "fix";
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <button
        onClick={() => speak(w.w, { rate: 0.85 })}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-ink/5 hover:text-ink"
        aria-label={`Hear ${w.w}`}
      >
        <Volume2 size={17} />
      </button>
      <button onClick={onClick} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[16px] font-medium">{w.w}</span>
          <span className="font-display text-[15px] text-accent">{w.say}</span>
        </div>
        <div className="truncate text-sm text-ink-3">{w.m}</div>
      </button>
      <span
        className={clsx(
          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
          state === "learned" && "bg-good-soft text-good",
          state === "ok" && "bg-warn-soft text-warn",
          state === "fix" && "bg-bad-soft text-bad",
          state === "new" && "bg-ink/5 text-ink-3",
        )}
      >
        {state === "learned" ? <Check size={12} className="inline" /> : state === "fix" ? <X size={12} className="inline" /> : null} {state === "learned" ? "learned" : state === "ok" ? "once" : state === "fix" ? "fix" : "new"}
      </span>
    </div>
  );
}

function WordList({ title, words, stats, onBack, onPractice }: { title: string; words: Word[]; stats: Map<string, WordStat>; onBack: () => void; onPractice: (ws: Word[]) => void }) {
  const [shown, setShown] = useState(60);
  const [hideLearned, setHideLearned] = useState(false);
  const list = hideLearned ? words.filter((w) => !isLearned(stats.get(w.w))) : words;
  const next = words.filter((w) => !isLearned(stats.get(w.w))).slice(0, 10);
  const tag = Object.entries(TAGS).find(([, t]) => t.label === title);
  return (
    <div>
      <button onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} /> Pronounce
      </button>
      <h1 className="font-display text-[clamp(2rem,4.5vw,3rem)] leading-tight">{title}</h1>
      {tag && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">{tag[1].tip}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={() => onPractice(next.length ? next : words.slice(0, 10))}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-medium text-accent-ink shadow-soft transition hover:brightness-110 active:scale-[0.98]"
        >
          <Play size={16} fill="currentColor" /> Practice 10 of these
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={hideLearned} onChange={(e) => setHideLearned(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Hide learned words
        </label>
        <span className="text-sm text-ink-3">{list.length.toLocaleString()} words</span>
      </div>
      <div className="mt-6 overflow-hidden rounded-3xl border border-line bg-card">
        {list.slice(0, shown).map((w) => (
          <WordRow key={w.w} w={w} stat={stats.get(w.w)} onClick={() => onPractice([w, ...list.filter((x) => x !== w && !isLearned(stats.get(x.w))).slice(0, 9)])} />
        ))}
        {!list.length && <div className="p-6 text-center text-sm text-ink-3">All learned. Nicely done.</div>}
      </div>
      {shown < list.length && (
        <button onClick={() => setShown((n) => n + 100)} className="mt-4 w-full rounded-full border border-line py-3 text-sm font-medium hover:border-ink-3">
          Show more
        </button>
      )}
    </div>
  );
}
