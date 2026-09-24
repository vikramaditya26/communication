"use client";

import clsx from "clsx";
import { ArrowRight, Bookmark, BookmarkCheck, Check, Lightbulb, Mic, RotateCcw, Snail, Volume2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { alignReading, listenOnce, loadVoices, normalizeWord, speak, useSpeechSupported, wordsMatch, type WordMark } from "@/lib/speech";
import { bumpToday, logAttempt, saveItem } from "@/lib/store";
import { recordSentence, recordWord, TAG_ORDER, TAGS, type Word, type WordStat } from "@/lib/words";
import { Button } from "../ui";

type Phase = "word" | "sentence";
type WordTry = { right: boolean; heard: string };
type SentenceTry = { score: number; marks: WordMark[]; heard: string };
type Result = { w: Word; firstTry: boolean; sentence?: number };

const say = (text: string, rate = 0.85) => loadVoices().then(() => speak(text, { rate }));

export function WordSession({ words, stats, onExit, onAgain }: { words: Word[]; stats: Map<string, WordStat>; onExit: () => void; onAgain: (ws: Word[]) => void }) {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>("word");
  const [wordTry, setWordTry] = useState<WordTry | null>(null);
  const [sentTry, setSentTry] = useState<SentenceTry | null>(null);
  const [listening, setListening] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [saved, setSaved] = useState(false);
  const supported = useSpeechSupported();
  const logged = useRef(false);
  const w = words[i];
  const done = i >= words.length;

  // Hear each new word once when it appears.
  useEffect(() => {
    if (w && phase === "word") {
      const t = setTimeout(() => say(w.w), 300);
      return () => clearTimeout(t);
    }
  }, [w, phase]);

  const sayWord = async () => {
    setListening(true);
    const heard = await listenOnce(4000);
    setListening(false);
    bumpToday("spoken", 3);
    const right = heard.split(/\s+/).some((h) => wordsMatch(h, w.w));
    setWordTry({ right, heard });
    await recordWord(w.w, right);
    setResults((r) => (r.some((x) => x.w === w) ? r : [...r, { w, firstTry: right }]));
    if (right) setTimeout(() => setPhase("sentence"), 900);
  };

  const saySentence = async () => {
    setListening(true);
    const heard = await listenOnce(12000);
    setListening(false);
    bumpToday("spoken", 6);
    const expected = w.s.split(/\s+/);
    const marks = alignReading(expected, heard).map((m) => (m.heard === "__unread" ? { mark: "skip" as const } : m));
    const counted = marks.filter((_, k) => normalizeWord(expected[k]));
    const score = heard ? Math.round((counted.filter((m) => m.mark === "good").length / Math.max(1, counted.length)) * 100) : 0;
    setSentTry({ score, marks, heard });
    await recordSentence(w.w, score);
    setResults((r) => r.map((x) => (x.w === w ? { ...x, sentence: Math.max(x.sentence ?? 0, score) } : x)));
  };

  const next = () => {
    setI((n) => n + 1);
    setPhase("word");
    setWordTry(null);
    setSentTry(null);
  };

  useEffect(() => {
    if (!done || logged.current || !results.length) return;
    logged.current = true;
    const right = results.filter((r) => r.firstTry).length;
    logAttempt({ kind: "drill", score: Math.round((right / results.length) * 100), label: `Pronounce · ${results.length} words` });
  }, [done, results]);

  if (!supported) {
    return <div className="rounded-2xl bg-warn-soft p-4 text-sm">Practicing needs the microphone. Please open this page in Google Chrome.</div>;
  }

  if (done) {
    const missed = results.filter((r) => !r.firstTry).map((r) => r.w);
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-2xl">
        <div className="rounded-[32px] border border-line bg-card p-6 sm:p-8">
          <div className="font-display text-6xl tabular-nums">
            {results.filter((r) => r.firstTry).length}
            <span className="text-2xl text-ink-3"> / {results.length}</span>
          </div>
          <div className="mt-1 text-ink-2">clear on the first try</div>
          <ul className="mt-6 divide-y divide-line">
            {results.map((r) => (
              <li key={r.w.w} className="flex items-center gap-3 py-2.5">
                {r.firstTry ? <Check size={18} className="text-good" /> : <X size={18} className="text-bad" />}
                <button onClick={() => say(r.w.w)} className="flex min-w-0 flex-1 items-baseline gap-2 text-left">
                  <span className="font-medium">{r.w.w}</span>
                  <span className="truncate font-display text-accent">{r.w.say}</span>
                </button>
                {typeof r.sentence === "number" && <span className="text-xs tabular-nums text-ink-3">sentence {r.sentence}%</span>}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-2">
            {missed.length > 0 && (
              <>
                <Button icon={<RotateCcw size={15} />} onClick={() => onAgain(missed)}>
                  Practice the {missed.length} missed
                </Button>
                <Button
                  variant={saved ? "soft" : "outline"}
                  disabled={saved}
                  icon={saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
                  onClick={async () => {
                    for (const m of missed) await saveItem({ kind: "sound", text: m.w, note: m.m, context: m.s, detail: { sayItLike: m.say, ipa: m.ipa, example: m.s } });
                    setSaved(true);
                  }}
                >
                  {saved ? "Saved to Review" : "Save missed to Review"}
                </Button>
              </>
            )}
            <Button variant="outline" onClick={onExit}>
              Done
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  const stat = stats.get(w.w);
  // The most important tricky sound in this word, for words without a specific note.
  const tip = TAG_ORDER.map((t) => (w.tags.includes(t) ? TAGS[t].tip : null)).find(Boolean);
  const sentenceWords = w.s.split(/\s+/);
  const isTarget = (token: string) => normalizeWord(token).startsWith(normalizeWord(w.w).slice(0, Math.max(3, w.w.length - 2)));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex flex-1 gap-1">
          {words.map((x, k) => {
            const r = results.find((y) => y.w === x);
            return <div key={x.w} className={clsx("h-1.5 flex-1 rounded-full", k === i ? "bg-accent" : r ? (r.firstTry ? "bg-good" : "bg-bad") : "bg-ink/10")} />;
          })}
        </div>
        <button onClick={onExit} className="text-sm font-medium text-ink-2 hover:text-ink">
          Stop
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={w.w} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }} className="rounded-[32px] border border-line bg-card p-6 shadow-soft sm:p-8">
          {/* The word */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="break-words font-display text-[clamp(2.6rem,9vw,4rem)] leading-none tracking-tight">{w.w}</div>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-display text-2xl tracking-wide text-accent">{w.say}</span>
                <span className="text-ink-3">{w.ipa}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <button onClick={() => say(w.w)} className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-ink shadow-soft active:scale-95" aria-label="Hear it">
                <Volume2 size={22} />
              </button>
              <button onClick={() => say(w.w, 0.45)} className="flex h-12 w-12 items-center justify-center rounded-full border border-line active:scale-95" aria-label="Hear it slowly">
                <Snail size={20} />
              </button>
            </div>
          </div>

          <p className="mt-5 text-[17px] leading-relaxed">{w.m}</p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {w.tags.filter((t) => TAGS[t]).map((t) => (
              <span key={t} className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent" title={TAGS[t].tip}>
                {TAGS[t].short}
              </span>
            ))}
            {stat && <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs text-ink-3">tried {stat.tries}×</span>}
          </div>
          {(w.x || tip) && (
            <div className="mt-4 flex gap-2.5 rounded-2xl bg-warn-soft px-4 py-3 text-sm">
              <Lightbulb size={17} className="mt-0.5 shrink-0 text-warn" />
              <span>
                <b>{w.x ? "Common mistake:" : "Watch out:"}</b> {w.x ?? tip}
              </span>
            </div>
          )}

          {/* Step 1: the word */}
          {phase === "word" && (
            <div className="mt-7 border-t border-line pt-6 text-center">
              <MicButton listening={listening} onClick={sayWord} label="Say the word" disabled={Boolean(wordTry?.right)} />
              <AnimatePresence>
                {wordTry && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={clsx("mt-5 rounded-2xl p-4 text-left", wordTry.right ? "bg-good-soft" : "bg-bad-soft")}>
                    <div className="flex items-center gap-2 font-medium">
                      {wordTry.right ? <Check size={18} className="text-good" /> : <X size={18} className="text-bad" />}
                      {wordTry.right ? "Clear! Now try it in a sentence." : wordTry.heard ? `I heard “${wordTry.heard}”.` : "I didn’t hear anything. Try a little louder."}
                    </div>
                    {!wordTry.right && (
                      <>
                        <p className="mt-2 text-sm text-ink-2">{w.tags.map((t) => TAGS[t]?.tip).filter(Boolean)[0] ?? "Listen again, then copy the stress and the sounds."}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => setPhase("sentence")}>
                            Go to the sentence
                          </Button>
                          <Button size="sm" variant="ghost" onClick={next}>
                            Skip
                          </Button>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Step 2: the sentence */}
          {phase === "sentence" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-7 border-t border-line pt-6">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-3">Say it in a sentence</div>
              <p className="font-reading text-[21px] leading-relaxed">
                {sentenceWords.map((tok, k) => {
                  const m = sentTry?.marks[k];
                  return (
                    <span key={k}>
                      <span
                        className={clsx(
                          "rounded px-0.5",
                          isTarget(tok) && "bg-accent-soft font-semibold",
                          m?.mark === "good" && "text-good",
                          m?.mark === "bad" && "text-bad underline decoration-wavy underline-offset-4",
                          m?.mark === "skip" && "text-warn underline decoration-dotted underline-offset-4",
                        )}
                      >
                        {tok}
                      </span>{" "}
                    </span>
                  );
                })}
              </p>
              <div className="mt-3">
                <Button size="sm" variant="ghost" icon={<Volume2 size={15} />} onClick={() => say(w.s, 0.9)}>
                  Hear the sentence
                </Button>
              </div>
              <div className="mt-5 text-center">
                <MicButton listening={listening} onClick={saySentence} label={sentTry ? "Say it again" : "Say the sentence"} />
              </div>
              {sentTry && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-paper-2 p-4">
                  <div className="text-sm">
                    <span className={clsx("font-display text-2xl", sentTry.score >= 80 ? "text-good" : sentTry.score >= 50 ? "text-warn" : "text-bad")}>{sentTry.score}%</span>
                    <span className="ml-2 text-ink-2">{sentTry.score >= 80 ? "clear" : sentTry.heard ? "Try once more, a little slower." : "I didn’t hear anything."}</span>
                  </div>
                  <Button onClick={next}>
                    {i === words.length - 1 ? "Finish" : "Next word"} <ArrowRight size={16} />
                  </Button>
                </motion.div>
              )}
              {!sentTry && (
                <div className="mt-4 text-center">
                  <button onClick={next} className="text-sm text-ink-3 hover:text-ink">
                    Skip the sentence
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function MicButton({ listening, onClick, label, disabled }: { listening: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={listening || disabled ? undefined : onClick}
        className={clsx("flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lift transition", listening ? "recording-pulse bg-bad" : "bg-accent", disabled && "opacity-40")}
        aria-label={label}
      >
        <Mic size={30} />
      </motion.button>
      <span className="text-sm text-ink-2">{listening ? "Listening…" : label}</span>
    </div>
  );
}
