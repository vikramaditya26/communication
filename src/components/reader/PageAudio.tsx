"use client";

import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadVoices, speak, stopSpeaking } from "@/lib/speech";
import type { PageModel } from "./PageText";

const SENTENCE_END = /[.!?;:]["”’)\]]*$/;

export type PageAudio = ReturnType<typeof usePageAudio>;

/**
 * Reads the page out loud, one sentence at a time.
 * It can start from any word, pause, and step to the sentence before or after.
 */
export function usePageAudio({ model, rate, voice }: { model: PageModel | null; rate: number; voice: string | null }) {
  // The sentences of the page, as [first word, last word].
  const chunks = useMemo(() => {
    const out: [number, number][] = [];
    if (!model) return out;
    const tokens = model.tokens;
    let start = 0;
    for (let k = 0; k < tokens.length; k++) {
      const headingEnds = tokens[k].heading && !tokens[k + 1]?.heading;
      if ((SENTENCE_END.test(tokens[k].text) && k - start >= 2) || k - start >= 30 || k === tokens.length - 1 || headingEnds) {
        out.push([start, k]);
        start = k + 1;
      }
    }
    return out;
  }, [model]);

  const [now, setNow] = useState<{ chunk: number; word: number | null; paused: boolean } | null>(null);
  // Each play gets a number, so a sentence that was stopped can't start the next one.
  const run = useRef(0);
  const playNext = useRef<(c: number) => void>(() => {});

  const play = useCallback(
    (c: number) => {
      const id = ++run.current;
      stopSpeaking();
      if (!model || c < 0 || c >= chunks.length) return setNow(null);
      const [a, b] = chunks[c];
      let text = "";
      const offsets: number[] = [];
      for (let k = a; k <= b; k++) {
        offsets.push(text.length);
        text += model.tokens[k].text + " ";
      }
      setNow({ chunk: c, word: null, paused: false });
      loadVoices().then(() => {
        if (id !== run.current) return;
        speak(text, {
          rate,
          voice,
          onWord: (ci) => {
            if (id !== run.current) return;
            let idx = 0;
            while (idx + 1 < offsets.length && offsets[idx + 1] <= ci) idx++;
            setNow({ chunk: c, word: a + idx, paused: false });
          },
          onEnd: () => id === run.current && playNext.current(c + 1),
        });
      });
    },
    [model, chunks, rate, voice],
  );

  useEffect(() => {
    playNext.current = play;
  }, [play]);

  const stop = useCallback(() => {
    run.current++;
    stopSpeaking();
    setNow(null);
  }, []);

  /** Starts at the sentence that contains this word (the top of the page if left out). */
  const start = useCallback(
    (fromWord = 0) => {
      const c = chunks.findIndex(([, end]) => end >= fromWord);
      play(c < 0 ? 0 : c);
    },
    [chunks, play],
  );

  const pause = useCallback(() => {
    run.current++;
    stopSpeaking();
    setNow((s) => s && { ...s, word: null, paused: true });
  }, []);

  const chunk = now?.chunk ?? 0;
  const resume = useCallback(() => play(chunk), [play, chunk]);
  const next = useCallback(() => play(Math.min(chunks.length - 1, chunk + 1)), [play, chunk, chunks.length]);
  const prev = useCallback(() => play(Math.max(0, chunk - 1)), [play, chunk]);

  // A new page (or leaving the book) ends the listening.
  useEffect(() => stop, [model, stop]);

  const highlight = now && chunks[now.chunk] ? { from: chunks[now.chunk][0], to: chunks[now.chunk][1], word: now.word } : null;

  return { active: Boolean(now), paused: Boolean(now?.paused), sentence: chunk + 1, sentences: chunks.length, highlight, start, stop, pause, resume, next, prev };
}

/** The small player shown at the bottom of the page while it is being read out. */
export function ListenBar({ audio }: { audio: PageAudio }) {
  const round = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 transition hover:bg-ink/5 hover:text-ink active:scale-95 disabled:opacity-30";
  return (
    <div className="flex items-center gap-1 rounded-full border border-line bg-card/95 p-1.5 font-sans shadow-lift backdrop-blur-xl">
      <button onClick={audio.paused ? audio.resume : audio.pause} aria-label={audio.paused ? "Play" : "Pause"} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-soft active:scale-95">
        {audio.paused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
      </button>
      <button onClick={audio.prev} disabled={audio.sentence <= 1} aria-label="Previous sentence" className={round}>
        <SkipBack size={19} />
      </button>
      <button onClick={audio.next} disabled={audio.sentence >= audio.sentences} aria-label="Next sentence" className={round}>
        <SkipForward size={19} />
      </button>
      <div className="min-w-0 flex-1 px-1.5">
        <div className="text-sm font-medium">
          {audio.paused ? "Paused" : "Listening"} · {audio.sentence} of {audio.sentences}
        </div>
        <div className="truncate text-xs text-ink-3">Tap a word to jump</div>
      </div>
      <button onClick={audio.stop} aria-label="Stop listening" className={round}>
        <X size={20} />
      </button>
    </div>
  );
}
