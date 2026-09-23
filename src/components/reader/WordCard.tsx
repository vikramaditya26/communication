"use client";

import clsx from "clsx";
import { Check, Clock, Ear, Lightbulb, Mic, Volume2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCoach } from "@/lib/coach-client";
import { lookupDictionary, type DictEntry } from "@/lib/dictionary";
import { listen, speak, wordsMatch } from "@/lib/speech";
import { saveItem, savedId, savedKey, useStored, type SavedItem } from "@/lib/store";
import type { LibraryBook } from "@/lib/types";
import { CoachNotice, SaveToggle, SectionLabel, SpeakButton } from "../coach/Feedback";
import { IconButton, Sheet, Skeleton, useMediaQuery } from "../ui";
import type { Token } from "./PageText";

type Props = {
  token: Token | null;
  heardAs?: string;
  anchor: DOMRect | null;
  book: LibraryBook;
  page: number;
  voice: string | null;
  onClose: () => void;
};

export function WordCard({ token, heardAs, anchor, book, page, voice, onClose }: Props) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  if (!desktop) {
    return (
      <Sheet open={Boolean(token)} onClose={onClose}>
        {token && <WordHelp token={token} heardAs={heardAs} book={book} page={page} voice={voice} />}
      </Sheet>
    );
  }
  return (
    <AnimatePresence>
      {token && anchor && <Popover key={token.i} anchor={anchor} onClose={onClose}>
        <WordHelp token={token} heardAs={heardAs} book={book} page={page} voice={voice} onClose={onClose} />
      </Popover>}
    </AnimatePresence>
  );
}

function Popover({ anchor, onClose, children }: { anchor: DOMRect; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useMemo(() => {
    const W = 380;
    const left = Math.min(Math.max(16, anchor.left + anchor.width / 2 - W / 2), window.innerWidth - W - 16);
    const spaceBelow = window.innerHeight - anchor.bottom - 16;
    const spaceAbove = anchor.top - 16;
    return spaceBelow >= 380 || spaceBelow >= spaceAbove
      ? { left, top: anchor.bottom + 10, bottom: undefined, maxHeight: spaceBelow - 10 }
      : { left, top: undefined, bottom: window.innerHeight - anchor.top + 10, maxHeight: spaceAbove - 10 };
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (ref.current?.contains(target) || target.closest("[data-i]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: pos.top !== undefined ? -6 : 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.16 }}
      className="fixed z-50 w-[380px] overflow-y-auto rounded-[24px] border border-line bg-card font-sans text-ink shadow-lift"
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: Math.max(260, pos.maxHeight) }}
    >
      {children}
    </motion.div>
  );
}

function playWord(word: string, dict: DictEntry | null, voice: string | null, slow = false) {
  if (!slow && dict?.audio) {
    const audio = new Audio(dict.audio);
    audio.play().catch(() => speak(word, { voice, rate: 0.9 }));
  } else speak(word, { voice, rate: slow ? 0.5 : 0.9 });
}

function WordHelp({ token, heardAs, book, page, voice, onClose }: { token: Token; heardAs?: string; book: LibraryBook; page: number; voice: string | null; onClose?: () => void }) {
  const word = token.clean || token.text;
  const [found, setFound] = useState<{ word: string; entry: DictEntry | null } | null>(null);
  const dict = found?.word === word ? found.entry : null;
  const coach = useCoach("word", { word, sentence: token.sentence, book: `${book.title} by ${book.author}` }, { auto: true });
  const id = savedId("word", word);
  const [saved] = useStored<SavedItem>(savedKey(id));

  useEffect(() => {
    let alive = true;
    lookupDictionary(word).then((entry) => alive && setFound({ word, entry }));
    return () => {
      alive = false;
    };
  }, [word]);

  const d = coach.data;
  const ipa = d?.ipa || dict?.phonetic;
  const noCoach = coach.error && (coach.error.code === "no_key" || coach.error.code === "bad_key");

  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words font-display text-[34px] leading-none tracking-tight">{word}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[15px] text-ink-2">
            {ipa && <span className="tracking-wide">{ipa}</span>}
            {d?.partOfSpeech && <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs">{d.partOfSpeech}</span>}
          </div>
        </div>
        {onClose && (
          <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
            <X size={18} />
          </IconButton>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => playWord(word, dict, voice)} className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-accent-ink shadow-soft active:scale-95">
          <Volume2 size={16} /> Hear it
        </button>
        <button onClick={() => playWord(word, dict, voice, true)} className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium active:scale-95">
          <Clock size={15} /> Slowly
        </button>
        <SayItCheck word={word} />
      </div>

      {heardAs && heardAs !== "__unread" && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-bad-soft px-3.5 py-2.5 text-sm">
          <Ear size={16} className="shrink-0 text-bad" />
          <span>
            When you read, I heard <b>“{heardAs}”</b>.
          </span>
        </div>
      )}

      {(d?.sayItLike || coach.loading) && (
        <div className="mt-4 rounded-2xl bg-accent-soft px-4 py-3">
          <SectionLabel className="!mb-1 text-accent/80">Say it like</SectionLabel>
          {d ? <div className="font-display text-[26px] leading-tight tracking-wide text-accent">{d.sayItLike}</div> : <Skeleton className="h-7 w-40 bg-accent/15" />}
        </div>
      )}

      {coach.loading && (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {d && (
        <div className="mt-4 space-y-4 text-[15px] leading-relaxed">
          <div>
            <SectionLabel>Meaning</SectionLabel>
            <div>{d.meaning}</div>
          </div>
          {d.inThisSentence && (
            <div>
              <SectionLabel>In this sentence</SectionLabel>
              <div className="text-ink-2">{d.inThisSentence}</div>
            </div>
          )}
          {d.oldFashioned && d.modernWord && (
            <div className="rounded-2xl bg-warn-soft px-3.5 py-2.5 text-sm">
              <b className="text-warn">Old-fashioned.</b> Today we say <b>“{d.modernWord}”</b>.
            </div>
          )}
          {d.example && (
            <div>
              <SectionLabel>Use it today</SectionLabel>
              <div className="font-reading italic">“{d.example}”</div>
              <div className="mt-2">
                <SpeakButton text={d.example} label="Hear example" variant="ghost" />
              </div>
            </div>
          )}
          {d.synonyms.length > 0 && (
            <div>
              <SectionLabel>Other words you can use</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {d.synonyms.map((s) => (
                  <span key={s} className="rounded-full border border-line px-3 py-1 text-sm">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {d.soundTip && (
            <div className="flex gap-3 rounded-2xl bg-paper-2 p-3.5 text-sm">
              <Lightbulb size={18} className="mt-0.5 shrink-0 text-accent-2" />
              <div>{d.soundTip}</div>
            </div>
          )}
        </div>
      )}

      {noCoach && dict && (
        <div className="mt-4 space-y-3 text-[15px]">
          {dict.meanings.map((m, i) => (
            <div key={i}>
              <SectionLabel>{m.partOfSpeech}</SectionLabel>
              <ul className="list-disc space-y-1 pl-5 text-ink-2">
                {m.definitions.map((def, k) => (
                  <li key={k}>{def}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {coach.error && (
        <div className="mt-4">
          <CoachNotice error={coach.error} onRetry={() => coach.run()} />
        </div>
      )}

      <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
        <SaveToggle
          saved={Boolean(saved)}
          label="Save to review"
          onSave={() =>
            saveItem({
              kind: "word",
              text: word,
              note: d?.meaning ?? dict?.meanings[0]?.definitions[0] ?? "",
              detail: d ? { ipa: d.ipa, sayItLike: d.sayItLike, example: d.example } : dict?.phonetic ? { ipa: dict.phonetic } : undefined,
              context: token.sentence,
              slug: book.slug,
              page,
            })
          }
        />
        <span className="text-xs text-ink-3">{saved ? "It will come back in Review." : ""}</span>
      </div>
    </div>
  );
}

/** Say the word and check if the browser recognises it. */
export function SayItCheck({ word }: { word: string }) {
  const [state, setState] = useState<"idle" | "listening" | "good" | "bad">("idle");
  const [heard, setHeard] = useState("");

  const start = () => {
    setState("listening");
    setHeard("");
    let matched = false;
    let lastHeard = "";
    const l = listen({
      onText: (finalText, interim) => {
        const all = `${finalText} ${interim}`.trim();
        if (!all) return;
        lastHeard = all;
        if (all.split(/\s+/).some((w) => wordsMatch(w, word))) {
          matched = true;
          l?.stop();
        }
      },
      onError: () => setState("bad"),
      onEnd: () => {
        setHeard(lastHeard);
        setState(matched ? "good" : "bad");
      },
    });
    setTimeout(() => l?.stop(), 3500);
  };

  return (
    <>
      <button
        onClick={state === "listening" ? undefined : start}
        className={clsx(
          "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition active:scale-95",
          state === "listening" ? "recording-pulse border-bad bg-bad text-white" : "border-line",
        )}
      >
        <Mic size={15} /> {state === "listening" ? "Listening…" : "Say it"}
      </button>
      <AnimatePresence>
        {(state === "good" || state === "bad") && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={clsx("flex w-full items-center gap-2 overflow-hidden rounded-2xl px-3.5 py-2.5 text-sm", state === "good" ? "bg-good-soft" : "bg-bad-soft")}
          >
            {state === "good" ? (
              <>
                <Check size={16} className="text-good" /> That sounded right. Nice!
              </>
            ) : (
              <>
                <Ear size={16} className="shrink-0 text-bad" />
                {heard ? (
                  <span>
                    I heard “{heard}”. Listen again and try once more.
                  </span>
                ) : (
                  <span>I didn’t hear anything. Try again a little louder.</span>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
