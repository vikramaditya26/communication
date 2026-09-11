"use client";

import clsx from "clsx";
import { ArrowRight, BookOpen, Check, Layers, Search, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getBook } from "@/lib/library";
import { speak } from "@/lib/speech";
import { bumpToday, nextReview, remove, savedKey, schedule, useStoredList, write, type Grade, type SavedItem, type SavedKind } from "@/lib/store";
import { useNow } from "@/lib/useNow";
import { SectionLabel, SpeakButton } from "../coach/Feedback";
import { SayItCheck } from "../reader/WordCard";
import { Button, Chip, EmptyState } from "../ui";

const KIND_LABEL: Record<SavedKind, string> = { word: "Word", sound: "Pronunciation", phrase: "Phrase", grammar: "Grammar" };
const KIND_STYLE: Record<SavedKind, string> = {
  word: "bg-accent-soft text-accent",
  sound: "bg-bad-soft text-bad",
  phrase: "bg-warn-soft text-warn",
  grammar: "bg-good-soft text-good",
};
const FILTERS: ("all" | SavedKind)[] = ["all", "word", "sound", "phrase", "grammar"];

const DAY = 86_400_000;
const inWords = (ms: number) => {
  if (ms <= 60_000) return "now";
  if (ms < DAY) return "later today";
  const d = Math.round(ms / DAY);
  return d === 1 ? "tomorrow" : d < 30 ? `in ${d} days` : `in ${Math.round(d / 30)} months`;
};

export function ReviewView() {
  const [items, loaded] = useStoredList<SavedItem>("saved:");
  const now = useNow();
  const [session, setSession] = useState<string[] | null>(null);
  const [doneCount, setDoneCount] = useState(0);

  const due = useMemo(() => (now ? items.filter((i) => i.due <= now).sort((a, b) => a.due - b.due) : []), [items, now]);

  const startSession = () => {
    setSession(due.slice(0, 30).map((i) => i.id));
    setDoneCount(0);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 md:pt-14">
      <h1 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[1] tracking-tight">Review</h1>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ink-2">Words and corrections you saved show up here again, so you don’t forget them. A few minutes a day is enough.</p>

      {session ? (
        <Session ids={session} items={items} onGraded={() => setDoneCount((n) => n + 1)} done={doneCount} onExit={() => setSession(null)} />
      ) : (
        <>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative mt-8 overflow-hidden rounded-[32px] bg-ink p-6 text-paper sm:p-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/30 blur-3xl" />
            <div className="relative flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="font-display text-6xl leading-none tabular-nums">{due.length}</div>
                <div className="mt-2 opacity-70">{due.length === 1 ? "card is ready to review" : "cards are ready to review"}</div>
              </div>
              <Button size="lg" onClick={startSession} disabled={!due.length} className="!bg-paper !text-ink" icon={<Layers size={18} />}>
                {due.length ? "Start review" : "All done for now"}
              </Button>
            </div>
          </motion.div>

          {loaded && !items.length ? (
            <EmptyState icon={<BookOpen size={24} />} title="Nothing saved yet">
              While reading, tap a word and press <b>Save to review</b>. Words you mispronounce and grammar fixes can be saved too.
              <div className="mt-5">
                <Link href="/" className="inline-flex items-center gap-2 font-medium text-accent hover:underline">
                  Open the library <ArrowRight size={15} />
                </Link>
              </div>
            </EmptyState>
          ) : (
            <SavedList items={items} now={now} />
          )}
        </>
      )}
    </div>
  );
}

function Session({ ids, items, done, onGraded, onExit }: { ids: string[]; items: SavedItem[]; done: number; onGraded: () => void; onExit: () => void }) {
  const [position, setPosition] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const item = byId.get(ids[position]);
  const finished = position >= ids.length;

  const grade = async (g: Grade) => {
    if (!item) return;
    const next = schedule(item, g);
    await write(savedKey(item.id), next);
    await bumpToday("reviewed");
    onGraded();
    setFlipped(false);
    setPosition((p) => p + 1);
  };

  useEffect(() => {
    if (item?.kind === "word" && flipped) speak(item.text, { rate: 0.9 });
  }, [item, flipped]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === " " && !flipped) {
        e.preventDefault();
        setFlipped(true);
      }
      if (flipped && ["1", "2", "3", "4"].includes(e.key)) grade((["again", "hard", "good", "easy"] as Grade[])[Number(e.key) - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (finished || !item) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mt-10 flex flex-col items-center rounded-[32px] border border-line bg-card px-6 py-14 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 10, stiffness: 180, delay: 0.1 }} className="flex h-20 w-20 items-center justify-center rounded-full bg-good text-white">
          <Check size={40} strokeWidth={3} />
        </motion.div>
        <div className="mt-6 font-display text-3xl">That’s all for now</div>
        <p className="mt-2 text-ink-2">
          You reviewed {done} {done === 1 ? "card" : "cards"}.
        </p>
        <Button className="mt-6" variant="outline" onClick={onExit}>
          Back to Review
        </Button>
      </motion.div>
    );
  }

  const preview = (g: Grade) => inWords(nextReview(item, g).delay);
  const book = item.slug ? getBook(item.slug) : undefined;

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
          <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${(position / ids.length) * 100}%` }} />
        </div>
        <span className="text-sm tabular-nums text-ink-3">
          {position + 1} / {ids.length}
        </span>
        <button onClick={onExit} className="text-sm font-medium text-ink-2 hover:text-ink">
          Stop
        </button>
      </div>

      <div style={{ perspective: 1400 }}>
        <AnimatePresence mode="wait">
          <motion.div key={item.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.22 }}>
            <motion.div
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 160 }}
              style={{ transformStyle: "preserve-3d" }}
              className="relative min-h-[360px]"
            >
              {/* Front */}
              <div className="absolute inset-0 flex flex-col rounded-[32px] border border-line bg-card p-6 shadow-soft [backface-visibility:hidden] sm:p-8">
                <span className={clsx("self-start rounded-full px-2.5 py-1 text-xs font-semibold", KIND_STYLE[item.kind])}>{KIND_LABEL[item.kind]}</span>
                <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                  {item.kind === "grammar" ? (
                    <>
                      <div className="text-sm text-ink-3">How do you say this correctly?</div>
                      <div className="mt-3 font-reading text-2xl leading-snug text-ink-2 line-through decoration-bad/50">{String(item.detail?.youSaid ?? "")}</div>
                    </>
                  ) : item.kind === "phrase" ? (
                    <>
                      <div className="text-sm text-ink-3">What does this mean? Say it in your own words.</div>
                      <div className="mt-3 line-clamp-6 font-reading text-xl italic leading-relaxed">“{item.text}”</div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-ink-3">{item.kind === "sound" ? "Say this word clearly" : "What does it mean? Say it aloud."}</div>
                      <div className="mt-3 break-words font-display text-[clamp(2.5rem,8vw,4rem)] leading-none tracking-tight">{item.text}</div>
                      {item.kind === "sound" && (
                        <div className="mt-5 flex flex-wrap justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <SayItCheck word={item.text} />
                        </div>
                      )}
                    </>
                  )}
                </div>
                <Button size="lg" className="w-full" onClick={() => setFlipped(true)}>
                  Show answer
                </Button>
              </div>

              {/* Back */}
              <div className="absolute inset-0 flex flex-col overflow-y-auto rounded-[32px] border border-line bg-card p-6 shadow-soft [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-8">
                <span className={clsx("self-start rounded-full px-2.5 py-1 text-xs font-semibold", KIND_STYLE[item.kind])}>{KIND_LABEL[item.kind]}</span>
                <div className="flex-1 space-y-4 py-5">
                  {item.kind === "grammar" ? (
                    <>
                      <div className="font-reading text-2xl font-medium leading-snug text-good">{item.text}</div>
                      <p className="text-[15px] text-ink-2">{item.note}</p>
                      <SpeakButton text={item.text} label="Hear it" />
                    </>
                  ) : item.kind === "phrase" ? (
                    <>
                      <div className="font-reading text-lg italic text-ink-2">“{item.text}”</div>
                      {item.note ? <div className="text-[17px] leading-relaxed">{item.note}</div> : <div className="text-sm text-ink-3">Open the book page to explain this phrase with the coach.</div>}
                      {typeof item.detail?.natural === "string" && (
                        <div className="rounded-2xl bg-paper-2 p-3 text-[15px]">
                          <SectionLabel>Say it naturally</SectionLabel>“{item.detail.natural}”
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <div className="font-display text-4xl tracking-tight">{item.text}</div>
                        {typeof item.detail?.sayItLike === "string" && <div className="font-display text-2xl text-accent">{item.detail.sayItLike}</div>}
                        {typeof item.detail?.ipa === "string" && <div className="text-ink-3">{item.detail.ipa}</div>}
                      </div>
                      {item.note && <p className="text-[17px] leading-relaxed">{item.note}</p>}
                      {typeof item.detail?.example === "string" && <p className="font-reading italic text-ink-2">“{item.detail.example}”</p>}
                      <div className="flex flex-wrap gap-2">
                        <SpeakButton text={item.text} label="Hear it" rate={0.85} />
                        <SpeakButton text={item.text} label="Slowly" rate={0.5} variant="outline" />
                      </div>
                    </>
                  )}
                  {item.context && (
                    <div className="border-t border-line pt-4">
                      <SectionLabel>From {book ? book.title : "your reading"}</SectionLabel>
                      <p className="font-reading text-[15px] leading-relaxed text-ink-2">{item.context}</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      ["again", "Again", "bg-bad-soft text-bad"],
                      ["hard", "Hard", "bg-warn-soft text-warn"],
                      ["good", "Good", "bg-good-soft text-good"],
                      ["easy", "Easy", "bg-accent-soft text-accent"],
                    ] as [Grade, string, string][]
                  ).map(([g, label, style], k) => (
                    <button key={g} onClick={() => grade(g)} className={clsx("flex flex-col items-center rounded-2xl py-2.5 transition active:scale-95", style)}>
                      <span className="text-[15px] font-semibold">{label}</span>
                      <span className="text-[11px] opacity-75">{preview(g)}</span>
                      <span className="sr-only">key {k + 1}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="mt-4 hidden text-center text-xs text-ink-3 md:block">Space to show the answer · 1–4 to grade</p>
    </div>
  );
}

function SavedList({ items, now }: { items: SavedItem[]; now: number }) {
  const [filter, setFilter] = useState<"all" | SavedKind>("all");
  const [q, setQ] = useState("");
  const list = items
    .filter((i) => filter === "all" || i.kind === filter)
    .filter((i) => !q || `${i.text} ${i.note}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const i of items) c[i.kind] = (c[i.kind] ?? 0) + 1;
    return c;
  }, [items]);

  return (
    <section className="mt-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-2xl">Saved</h2>
        <label className="relative flex items-center sm:w-64">
          <Search size={15} className="absolute left-3.5 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-10 w-full rounded-full border border-line bg-card pl-10 pr-4 text-sm outline-none focus:border-accent" />
        </label>
      </div>
      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : KIND_LABEL[f]} <span className="opacity-60">{counts[f] ?? 0}</span>
          </Chip>
        ))}
      </div>
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
        <AnimatePresence initial={false}>
          {list.map((i) => (
            <motion.li key={i.id} layout exit={{ opacity: 0, height: 0 }} className="group flex items-start gap-3 px-4 py-3.5">
              <span className={clsx("mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", KIND_STYLE[i.kind])}>{KIND_LABEL[i.kind]}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{i.text}</div>
                {i.note && <div className="line-clamp-2 text-sm text-ink-2">{i.note}</div>}
                <div className="mt-1 text-xs text-ink-3">Next review {now ? inWords(i.due - now) : ""}</div>
              </div>
              <button onClick={() => speak(i.text, { rate: 0.9 })} className="rounded-full p-2 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label="Hear it">
                <SpeakerIcon />
              </button>
              <button onClick={() => remove(savedKey(i.id))} className="rounded-full p-2 text-ink-3 opacity-60 hover:bg-bad-soft hover:text-bad group-hover:opacity-100" aria-label="Delete">
                <Trash2 size={16} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
        {!list.length && <li className="px-4 py-8 text-center text-sm text-ink-3">Nothing here.</li>}
      </ul>
    </section>
  );
}

function SpeakerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  );
}
