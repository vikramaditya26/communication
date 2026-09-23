"use client";

import clsx from "clsx";
import { ArrowLeft, ArrowRight, BookmarkCheck, BookmarkPlus, Keyboard, Mic, RotateCcw, Send, Square, Volume2, VolumeX } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CHARACTERS, getCharacter, type Character } from "@/lib/characters";
import type { ChatReply } from "@/lib/coach";
import { askCoach, CoachError } from "@/lib/coach-client";
import { getBook } from "@/lib/library";
import { listen, loadVoices, speak, stopSpeaking, useSpeechSupported, type Listener } from "@/lib/speech";
import { bumpToday, logAttempt, saveItem, useStored, useStoredList, type SavedItem } from "@/lib/store";
import { CoachNotice } from "../coach/Feedback";
import { Cover } from "../Cover";

type Msg = { role: "learner" | "character"; text: string; at: number; correction?: ChatReply["correction"]; newWord?: ChatReply["newWord"] };
type Conversation = { messages: Msg[]; updatedAt: number };
const chatKey = (id: string) => `chat:${id}`;

export function TalkView({ initial }: { initial?: string }) {
  const [openId, setOpenId] = useState<string | null>(getCharacter(initial)?.id ?? null);
  const open = getCharacter(openId);
  return (
    <AnimatePresence mode="wait">
      {open ? (
        <motion.div key={open.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <Chat c={open} onBack={() => setOpenId(null)} />
        </motion.div>
      ) : (
        <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 md:pt-14">
          <Link href="/speak" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
            <ArrowLeft size={16} /> Speak
          </Link>
          <div className="text-[13px] font-semibold uppercase tracking-[0.22em] text-accent">Conversation practice</div>
          <h1 className="mt-3 font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[1] tracking-tight">Talk with a character</h1>
          <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ink-2">
            Have a real conversation out loud. They answer in simple English, and quietly correct your grammar under each thing you say.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CHARACTERS.map((c, i) => (
              <CharacterCard key={c.id} c={c} index={i} onOpen={() => setOpenId(c.id)} />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Avatar({ c, size = 44 }: { c: Character; size?: number }) {
  const book = c.book ? getBook(c.book) : undefined;
  if (book?.cover) {
    return (
      <span className="block shrink-0 overflow-hidden rounded-full [container-type:inline-size]" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={book.cover} alt="" className="h-full w-full scale-150 object-cover object-[50%_30%]" />
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-display text-white" style={{ width: size, height: size, background: c.color, fontSize: size * 0.42 }}>
      {c.name[0]}
    </span>
  );
}

function CharacterCard({ c, index, onOpen }: { c: Character; index: number; onOpen: () => void }) {
  const [conv] = useStored<Conversation>(chatKey(c.id));
  const book = c.book ? getBook(c.book) : undefined;
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      className="group flex gap-4 rounded-[28px] border border-line bg-card p-4 text-left shadow-soft transition-shadow hover:shadow-lift"
    >
      <div className="w-16 shrink-0 [container-type:inline-size]">
        {book ? <Cover book={book} className="shadow-soft" /> : <div className="flex aspect-[2/3] items-center justify-center rounded-lg font-display text-3xl text-white" style={{ background: c.color }}>{c.name[0]}</div>}
      </div>
      <div className="min-w-0 flex-1 py-1">
        <div className="font-display text-xl leading-tight">{c.name}</div>
        <div className="mt-0.5 truncate text-xs text-ink-3">{c.from}</div>
        <p className="mt-2 line-clamp-2 text-sm italic text-ink-2">“{c.opening}”</p>
        {conv?.messages.length ? <div className="mt-2 text-xs font-medium text-accent">Continue conversation · {conv.messages.filter((m) => m.role === "learner").length} messages</div> : null}
      </div>
    </motion.button>
  );
}

/** Listens until the learner pauses, then hands over what was said. */
function useDictation(onDone: (text: string) => void) {
  const [state, setState] = useState<"idle" | "listening">("idle");
  const [text, setText] = useState("");
  const listener = useRef<Listener | null>(null);
  const watchdog = useRef<ReturnType<typeof setInterval> | null>(null);
  const heard = useRef("");
  const started = useRef(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  const stop = useCallback(() => listener.current?.stop(), []);

  const start = useCallback(() => {
    stopSpeaking();
    heard.current = "";
    setText("");
    started.current = Date.now();
    let lastChange = Date.now();
    listener.current = listen({
      onText: (finalText, interim) => {
        const all = `${finalText} ${interim}`.trim();
        if (all !== heard.current) lastChange = Date.now();
        heard.current = all;
        setText(all);
      },
      onError: () => stop(),
      onEnd: () => {
        if (watchdog.current) clearInterval(watchdog.current);
        listener.current = null;
        setState("idle");
        bumpToday("spoken", Math.round((Date.now() - started.current) / 1000));
        if (heard.current.trim()) done.current(heard.current.trim());
      },
    });
    if (!listener.current) return;
    setState("listening");
    watchdog.current = setInterval(() => {
      const quiet = Date.now() - lastChange;
      const total = Date.now() - started.current;
      if ((heard.current && quiet > 2200) || (!heard.current && total > 8000) || total > 60_000) listener.current?.stop();
    }, 250);
  }, [stop]);

  useEffect(
    () => () => {
      listener.current?.stop();
      if (watchdog.current) clearInterval(watchdog.current);
    },
    [],
  );

  return { state, text, start, stop };
}

function Chat({ c, onBack }: { c: Character; onBack: () => void }) {
  const [conv, save, loaded] = useStored<Conversation>(chatKey(c.id));
  const messages = conv?.messages ?? [];
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<CoachError | null>(null);
  const [typing, setTyping] = useState(false);
  const supported = useSpeechSupported();
  const [draft, setDraft] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [speakingAt, setSpeakingAt] = useState<number | null>(null);
  const [savedList] = useStoredList<SavedItem>("saved:grammar-");
  const savedTexts = new Set(savedList.map((s) => s.text));
  const bottom = useRef<HTMLDivElement>(null);
  const latest = useRef(messages);
  useEffect(() => {
    latest.current = messages;
  });

  // Start with the character's greeting.
  useEffect(() => {
    if (loaded && !conv) save({ messages: [{ role: "character", text: c.opening, at: Date.now() }], updatedAt: Date.now() });
  }, [loaded, conv, save, c.opening]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking]);

  const say = useCallback(
    (m: Msg) => {
      setSpeakingAt(m.at);
      loadVoices().then(() => speak(m.text, { rate: 0.95, onEnd: () => setSpeakingAt(null) }));
    },
    [],
  );

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      setError(null);
      const learner: Msg = { role: "learner", text: clean, at: Date.now() };
      const before = latest.current;
      const withLearner = [...before, learner];
      await save({ messages: withLearner, updatedAt: Date.now() });
      setThinking(true);
      try {
        const res = await askCoach("chat", {
          character: c.name,
          persona: c.persona,
          book: c.from,
          history: before.slice(-12).map((m) => ({ role: m.role, text: m.text })),
          message: clean,
        });
        const reply: Msg = { role: "character", text: res.reply, at: Date.now(), newWord: res.newWord?.word ? res.newWord : undefined };
        const updated = withLearner.map((m) => (m.at === learner.at ? { ...m, correction: res.correction?.needed ? res.correction : undefined } : m));
        await save({ messages: [...updated, reply], updatedAt: Date.now() });
        if (voiceOn) say(reply);
      } catch (e) {
        setError(e instanceof CoachError ? e : new CoachError("failed", String(e)));
      } finally {
        setThinking(false);
      }
    },
    [c, save, say, voiceOn],
  );

  const dictation = useDictation(send);
  const listening = dictation.state === "listening";

  // Log the conversation for the Progress page when leaving.
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);
  useEffect(
    () => () => {
      const learnerMsgs = latest.current.filter((m) => m.role === "learner" && m.at > openedAt.current);
      if (learnerMsgs.length < 2) return;
      const clean = learnerMsgs.filter((m) => !m.correction).length;
      logAttempt({ kind: "chat", score: Math.round((clean / learnerMsgs.length) * 100), label: `Talk with ${c.name}` });
    },
    [c.name],
  );

  const restart = () => {
    stopSpeaking();
    save({ messages: [{ role: "character", text: c.opening, at: Date.now() }], updatedAt: Date.now() });
    setError(null);
  };

  const learnerCount = messages.filter((m) => m.role === "learner").length;

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem-5rem)] max-w-3xl flex-col px-4 sm:px-6 md:h-[calc(100dvh-4rem-2rem)]">
      <div className="flex items-center gap-3 border-b border-line py-3">
        <button onClick={onBack} className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-ink/5" aria-label="All characters">
          <ArrowLeft size={20} />
        </button>
        <Avatar c={c} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl leading-tight">{c.name}</div>
          <div className="truncate text-xs text-ink-3">{c.from}</div>
        </div>
        <button onClick={() => setVoiceOn((v) => !v)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-ink/5" aria-label={voiceOn ? "Mute replies" : "Speak replies"} title={voiceOn ? "Replies are read out loud" : "Replies are silent"}>
          {voiceOn ? <Volume2 size={19} /> : <VolumeX size={19} />}
        </button>
        <button onClick={restart} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-ink/5" aria-label="New conversation" title="New conversation">
          <RotateCcw size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5">
        {messages.map((m, i) => (
          <motion.div key={m.at} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i === messages.length - 1 ? 0.05 : 0 }} className={clsx("flex gap-2.5", m.role === "learner" && "flex-row-reverse")}>
            {m.role === "character" && <Avatar c={c} size={32} />}
            <div className={clsx("max-w-[82%] space-y-1.5", m.role === "learner" && "items-end")}>
              <div
                className={clsx(
                  "rounded-3xl px-4 py-2.5 text-[16px] leading-relaxed",
                  m.role === "character" ? "rounded-tl-md bg-card shadow-soft" : "rounded-tr-md bg-accent text-accent-ink",
                  m.role === "character" && "font-reading",
                )}
              >
                {m.text}
                {m.role === "character" && (
                  <button onClick={() => say(m)} className={clsx("ml-2 inline-flex translate-y-0.5 text-ink-3 hover:text-ink", speakingAt === m.at && "text-accent")} aria-label="Hear it">
                    <Volume2 size={15} />
                  </button>
                )}
              </div>
              {m.newWord && (
                <div className="px-2 text-xs text-ink-3">
                  New word: <b className="text-ink-2">{m.newWord.word}</b> · {m.newWord.meaning}
                </div>
              )}
              {m.correction && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="ml-auto max-w-full rounded-2xl border border-line bg-card px-3.5 py-2.5 text-sm">
                  <div className="text-ink-3 line-through decoration-bad/60">{m.correction.youSaid}</div>
                  <div className="mt-0.5 flex items-start gap-1.5 font-medium text-good">
                    <ArrowRight size={14} className="mt-1 shrink-0" /> {m.correction.better}
                  </div>
                  <div className="mt-1 text-xs text-ink-2">{m.correction.why}</div>
                  <div className="mt-2 flex gap-3 text-xs font-medium">
                    <button onClick={() => speak(m.correction!.better, { rate: 0.9 })} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink">
                      <Volume2 size={13} /> Hear it
                    </button>
                    {savedTexts.has(m.correction.better) ? (
                      <span className="inline-flex items-center gap-1 text-accent">
                        <BookmarkCheck size={13} /> Saved
                      </span>
                    ) : (
                      <button
                        onClick={() => saveItem({ kind: "grammar", text: m.correction!.better, note: m.correction!.why, detail: { youSaid: m.correction!.youSaid } })}
                        className="inline-flex items-center gap-1 text-ink-2 hover:text-ink"
                      >
                        <BookmarkPlus size={13} /> Save
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        ))}

        {thinking && (
          <div className="flex gap-2.5">
            <Avatar c={c} size={32} />
            <div className="flex items-center gap-1 rounded-3xl rounded-tl-md bg-card px-4 py-3.5 shadow-soft">
              {[0, 1, 2].map((d) => (
                <motion.span key={d} className="h-2 w-2 rounded-full bg-ink-3" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: d * 0.18 }} />
              ))}
            </div>
          </div>
        )}
        {error && <CoachNotice error={error} onRetry={() => setError(null)} />}

        {learnerCount === 0 && !thinking && (
          <div className="pt-2">
            <div className="mb-2 text-xs text-ink-3">Not sure what to say? Try:</div>
            <div className="flex flex-wrap gap-2">
              {c.starters.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-card px-3.5 py-1.5 text-sm transition hover:border-ink-3">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="border-t border-line py-3">
        {typing || !supported ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
              setDraft("");
            }}
          >
            {supported && (
              <button type="button" onClick={() => setTyping(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-ink/5" aria-label="Speak instead">
                <Mic size={20} />
              </button>
            )}
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Say something to ${c.name}…`}
              className="h-11 min-w-0 flex-1 rounded-full border border-line bg-card px-4 text-[15px] outline-none focus:border-accent"
            />
            <button type="submit" disabled={!draft.trim() || thinking} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink disabled:opacity-40" aria-label="Send">
              <Send size={18} />
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={() => setTyping(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-ink/5" aria-label="Type instead">
              <Keyboard size={20} />
            </button>
            <div className="min-w-0 flex-1 text-center text-sm text-ink-2">
              {listening ? <span className="italic">{dictation.text || "Listening…"}</span> : thinking ? `${c.name} is thinking…` : "Tap the microphone and speak"}
            </div>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={listening ? dictation.stop : dictation.start}
              disabled={thinking}
              className={clsx("flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-lift disabled:opacity-40", listening ? "recording-pulse bg-bad" : "bg-accent")}
              aria-label={listening ? "Stop" : "Speak"}
            >
              {listening ? <Square size={18} fill="currentColor" /> : <Mic size={24} />}
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
}
