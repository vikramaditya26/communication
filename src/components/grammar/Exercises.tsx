"use client";

import clsx from "clsx";
import { ArrowRight, Check, Keyboard, Mic, RotateCcw, Volume2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { answerMatches, correctSentence, normalizeAnswer, recordResult, type Exercise } from "@/lib/grammar";
import { listenOnce, loadVoices, speak, useSpeechSupported } from "@/lib/speech";
import { Button, Spinner } from "../ui";

export type Item = { lesson: string; i: number; e: Exercise };
export type ItemResult = { lesson: string; i: number; right: boolean };

const say = (text: string) => loadVoices().then(() => speak(text, { rate: 0.9 }));

const PROMPT: Record<Exercise["k"], string> = {
  pick: "Choose the right answer",
  spot: "Tap the mistake",
  type: "Type the missing word",
  order: "Put the words in order",
  say: "Say it out loud",
};

/**
 * Runs a list of exercises one by one. A wrong answer comes back once at the end,
 * but only the first try counts for the score.
 */
export function ExerciseRunner({ items, onDone }: { items: Item[]; onDone: (results: ItemResult[]) => void }) {
  const [queue, setQueue] = useState(items);
  const [pos, setPos] = useState(0);
  const [answer, setAnswer] = useState<{ right: boolean } | null>(null);
  const [results, setResults] = useState<ItemResult[]>([]);
  const current = queue[pos];
  const retry = pos >= items.length;
  const continueRef = useRef<HTMLButtonElement>(null);

  const answered = (right: boolean) => {
    setAnswer({ right });
    if (!retry) {
      setResults((r) => [...r, { lesson: current.lesson, i: current.i, right }]);
      recordResult(current.lesson, current.i, right);
      if (!right) setQueue((q) => [...q, current]);
    }
    setTimeout(() => continueRef.current?.focus(), 50);
  };

  const next = () => {
    if (pos + 1 >= queue.length) return onDone(results);
    setPos((p) => p + 1);
    setAnswer(null);
  };

  const firstTry = results.filter((r) => r.right).length;
  if (!current) return null;
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
          <motion.div className="h-full rounded-full bg-good" animate={{ width: `${(Math.min(pos + (answer ? 1 : 0), queue.length) / queue.length) * 100}%` }} />
        </div>
        <span className="text-xs tabular-nums text-ink-3">
          {firstTry} / {items.length}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={pos} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }} className="mt-6">
          <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-accent">
            {retry ? "Try this one again" : PROMPT[current.e.k]}
          </div>
          <div className="mt-4">
            <ExerciseCard e={current.e} onAnswer={answered} locked={Boolean(answer)} />
          </div>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {answer && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={clsx("mt-6 rounded-3xl p-5", answer.right ? "bg-good-soft" : "bg-bad-soft")}
          >
            <div className={clsx("flex items-center gap-2 font-semibold", answer.right ? "text-good" : "text-bad")}>
              {answer.right ? <Check size={18} strokeWidth={3} /> : <X size={18} strokeWidth={3} />}
              {answer.right ? pick(["Correct!", "Well done!", "Exactly right.", "Nice!"], pos) : "Not quite."}
            </div>
            <div className="mt-2 flex items-start gap-2">
              <p className="flex-1 text-[17px] font-medium leading-snug">{correctSentence(current.e)}</p>
              <button onClick={() => say(correctSentence(current.e))} className="-mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-ink/5" aria-label="Hear it">
                <Volume2 size={18} />
              </button>
            </div>
            {current.e.y && <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{current.e.y}</p>}
            <Button ref={continueRef} size="lg" className="mt-4 w-full sm:w-auto" onClick={next} icon={<ArrowRight size={17} />}>
              Continue
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const pick = <T,>(list: T[], seed: number) => list[seed % list.length];

function ExerciseCard({ e, onAnswer, locked }: { e: Exercise; onAnswer: (right: boolean) => void; locked: boolean }) {
  switch (e.k) {
    case "pick":
      return <Pick e={e} onAnswer={onAnswer} locked={locked} />;
    case "spot":
      return <Spot e={e} onAnswer={onAnswer} locked={locked} />;
    case "type":
      return <Type e={e} onAnswer={onAnswer} locked={locked} />;
    case "order":
      return <Order e={e} onAnswer={onAnswer} locked={locked} />;
    case "say":
      return <Say e={e} onAnswer={onAnswer} locked={locked} />;
  }
}

/** Shows a sentence with its blanks. */
function Blanks({ q, fill, tone }: { q: string; fill?: string; tone?: "good" | "bad" }) {
  const parts = q.split("___");
  const fills = fill?.split(" / ") ?? [];
  return (
    <p className="font-display text-[clamp(1.4rem,3.5vw,1.9rem)] leading-snug">
      {parts.map((p, k) => (
        <span key={k}>
          {p}
          {k < parts.length - 1 && (
            <span
              className={clsx(
                "mx-1 inline-block min-w-[3.5rem] border-b-2 px-1 text-center",
                !fill && "border-ink-3 text-transparent",
                tone === "good" && "border-good text-good",
                tone === "bad" && "border-bad text-bad",
              )}
            >
              {fill ? fills[Math.min(k, fills.length - 1)] : "____"}
            </span>
          )}
        </span>
      ))}
    </p>
  );
}

function Pick({ e, onAnswer, locked }: { e: Extract<Exercise, { k: "pick" }>; onAnswer: (right: boolean) => void; locked: boolean }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const choose = (k: number) => {
    if (locked || chosen !== null) return;
    setChosen(k);
    onAnswer(k === e.a);
  };
  return (
    <>
      <Blanks q={e.q} fill={chosen !== null ? e.o[chosen] : undefined} tone={chosen === null ? undefined : chosen === e.a ? "good" : "bad"} />
      <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
        {e.o.map((o, k) => (
          <motion.button
            key={o}
            whileTap={{ scale: 0.97 }}
            onClick={() => choose(k)}
            disabled={chosen !== null}
            className={clsx(
              "min-h-12 rounded-2xl border-2 px-4 py-2.5 text-left text-[16px] font-medium transition",
              chosen === null && "border-line bg-card hover:border-ink-3",
              chosen !== null && k === e.a && "border-good bg-good-soft text-good",
              chosen === k && k !== e.a && "border-bad bg-bad-soft text-bad",
              chosen !== null && k !== e.a && chosen !== k && "border-line opacity-50",
            )}
          >
            <span className="mr-2 text-ink-3">{k + 1}</span>
            {o}
          </motion.button>
        ))}
      </div>
      <NumberKeys count={e.o.length} onKey={choose} active={chosen === null && !locked} />
    </>
  );
}

/** Lets you answer with the 1, 2, 3 keys on a keyboard. */
function NumberKeys({ count, onKey, active }: { count: number; onKey: (k: number) => void; active: boolean }) {
  const cb = useRef(onKey);
  useEffect(() => {
    cb.current = onKey;
  });
  useEffect(() => {
    if (!active) return;
    const h = (ev: KeyboardEvent) => {
      const n = Number(ev.key);
      if (n >= 1 && n <= count) cb.current(n - 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active, count]);
  return null;
}

function Spot({ e, onAnswer, locked }: { e: Extract<Exercise, { k: "spot" }>; onAnswer: (right: boolean) => void; locked: boolean }) {
  // Each word with its position in the sentence, so a tap can be compared with the mistake's position.
  const tokens = useMemo(() => {
    const out: { text: string; start: number; end: number }[] = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(e.q))) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    return out;
  }, [e.q]);
  const inMistake = (t: { start: number; end: number }) => t.start < e.at + e.w.length && t.end > e.at;
  const [tapped, setTapped] = useState<number | null>(null);
  const tap = (k: number) => {
    if (locked || tapped !== null) return;
    setTapped(k);
    onAnswer(inMistake(tokens[k]));
  };
  return (
    <div className="flex flex-wrap gap-x-1.5 gap-y-2">
      {tokens.map((t, k) => (
        <motion.button
          key={k}
          whileTap={{ scale: 0.94 }}
          onClick={() => tap(k)}
          disabled={tapped !== null}
          className={clsx(
            "rounded-xl px-2 py-1 font-display text-[clamp(1.35rem,3.4vw,1.8rem)] leading-tight transition",
            tapped === null && "hover:bg-accent-soft",
            tapped !== null && inMistake(t) && "bg-good-soft text-good line-through decoration-2",
            tapped === k && !inMistake(t) && "bg-bad-soft text-bad",
          )}
        >
          {t.text}
        </motion.button>
      ))}
      {tapped !== null && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full pt-2 text-sm text-ink-2">
          <span className="line-through decoration-bad/60">{e.w}</span> → <b className="text-good">{e.r || "(remove it)"}</b>
        </motion.div>
      )}
    </div>
  );
}

function Type({ e, onAnswer, locked }: { e: Extract<Exercise, { k: "type" }>; onAnswer: (right: boolean) => void; locked: boolean }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<boolean | null>(null);
  const check = () => {
    if (!value.trim() || result !== null || locked) return;
    const right = answerMatches(value, e.a);
    setResult(right);
    onAnswer(right);
  };
  const [before, after] = e.q.split("___");
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        check();
      }}
    >
      <p className="font-display text-[clamp(1.4rem,3.5vw,1.9rem)] leading-[1.6]">
        {before}
        <input
          autoFocus
          value={value}
          onChange={(ev) => setValue(ev.target.value)}
          disabled={result !== null}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          size={Math.max(6, value.length + 1)}
          className={clsx(
            "mx-1 rounded-none border-b-2 bg-transparent px-1 text-center font-display outline-none",
            result === null && "border-accent",
            result === true && "border-good text-good",
            result === false && "border-bad text-bad line-through",
          )}
          aria-label="Your answer"
        />
        {after}
      </p>
      {result === null && (
        <Button type="submit" size="lg" className="mt-6" disabled={!value.trim()}>
          Check
        </Button>
      )}
    </form>
  );
}

/** Same shuffle every time for the same sentence, but never the sentence itself. */
function shuffled(words: string[], seedText: string) {
  let seed = [...seedText].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
  for (let attempt = 0; attempt < 5; attempt++) {
    const list = words.map((w, i) => ({ w, i }));
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    if (list.some((x, k) => x.i !== k)) return list;
  }
  return words.map((w, i) => ({ w, i })).reverse();
}

function Order({ e, onAnswer, locked }: { e: Extract<Exercise, { k: "order" }>; onAnswer: (right: boolean) => void; locked: boolean }) {
  const pool = useMemo(() => shuffled(e.a.split(" "), e.a), [e.a]);
  const [placed, setPlaced] = useState<number[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const built = placed.map((k) => pool[k].w).join(" ");
  const check = () => {
    if (result !== null || locked) return;
    const right = [e.a, ...(e.alt ?? [])].some((a) => normalizeAnswer(a) === normalizeAnswer(built));
    setResult(right);
    onAnswer(right);
  };
  return (
    <>
      <div
        className={clsx(
          "flex min-h-[4.5rem] flex-wrap content-start gap-2 rounded-3xl border-2 border-dashed p-3 transition",
          result === null && "border-line",
          result === true && "border-good bg-good-soft",
          result === false && "border-bad bg-bad-soft",
        )}
      >
        {placed.map((k) => (
          <motion.button
            layout
            layoutId={`w${k}`}
            key={k}
            onClick={() => result === null && setPlaced((p) => p.filter((x) => x !== k))}
            className="rounded-xl bg-card px-3 py-1.5 text-[17px] font-medium shadow-soft"
          >
            {pool[k].w}
          </motion.button>
        ))}
        {!placed.length && <span className="self-center px-2 text-sm text-ink-3">Tap the words below in the right order</span>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {pool.map(({ w }, k) =>
          placed.includes(k) ? (
            <span key={k} className="rounded-xl bg-ink/5 px-3 py-1.5 text-[17px] text-transparent">
              {w}
            </span>
          ) : (
            <motion.button
              layout
              layoutId={`w${k}`}
              key={k}
              whileTap={{ scale: 0.94 }}
              onClick={() => result === null && setPlaced((p) => [...p, k])}
              className="rounded-xl border border-line bg-card px-3 py-1.5 text-[17px] font-medium hover:border-ink-3"
            >
              {w}
            </motion.button>
          ),
        )}
      </div>
      {result === null && (
        <div className="mt-6 flex gap-2">
          <Button size="lg" onClick={check} disabled={placed.length !== pool.length}>
            Check
          </Button>
          {placed.length > 0 && (
            <Button size="lg" variant="ghost" onClick={() => setPlaced([])} icon={<RotateCcw size={16} />}>
              Clear
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function Say({ e, onAnswer, locked }: { e: Extract<Exercise, { k: "say" }>; onAnswer: (right: boolean) => void; locked: boolean }) {
  const supported = useSpeechSupported();
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [done, setDone] = useState(false);
  const [value, setValue] = useState("");

  const finish = (text: string) => {
    const right = answerMatches(text, e.a);
    setHeard(text);
    setTries((t) => t + 1);
    // One more chance if it didn't match: speech recognition sometimes mishears.
    if (right || tries >= 1) {
      setDone(true);
      onAnswer(right);
    }
  };

  const listenNow = async () => {
    setListening(true);
    setHeard(null);
    const text = await listenOnce(9000);
    setListening(false);
    finish(text);
  };

  return (
    <>
      <p className="font-display text-[clamp(1.35rem,3.4vw,1.8rem)] leading-snug">{e.q}</p>
      {!done && !locked && (
        <div className="mt-6">
          {supported && !typing ? (
            <div className="flex flex-wrap items-center gap-3">
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={listenNow}
                disabled={listening}
                className={clsx("flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lift", listening ? "recording-pulse bg-bad" : "bg-accent")}
                aria-label="Speak"
              >
                {listening ? <Spinner className="h-6 w-6" /> : <Mic size={26} />}
              </motion.button>
              <div className="text-sm text-ink-2">{listening ? "Listening… say the whole sentence" : tries ? "Try once more" : "Tap and say your answer"}</div>
              <Button variant="ghost" size="sm" icon={<Keyboard size={15} />} onClick={() => setTyping(true)} className="ml-auto">
                Type instead
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                if (value.trim()) finish(value);
              }}
              className="flex gap-2"
            >
              <input
                autoFocus
                value={value}
                onChange={(ev) => setValue(ev.target.value)}
                placeholder="Type your answer"
                className="h-12 min-w-0 flex-1 rounded-full border border-line bg-card px-5 text-[16px] outline-none focus:border-accent"
              />
              <Button type="submit" size="lg" disabled={!value.trim()}>
                Check
              </Button>
            </form>
          )}
        </div>
      )}
      {heard !== null && (
        <p className="mt-4 text-sm text-ink-2">
          {typing ? "You wrote" : "We heard"}: <span className="font-medium text-ink">“{heard || "nothing"}”</span>
        </p>
      )}
    </>
  );
}
