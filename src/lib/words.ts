"use client";

import { read, write } from "./store";

/** One practice word (built by scripts/build-words.mjs). */
export type Word = {
  w: string;
  say: string; // easy respelling, stressed syllable in capitals
  ipa: string;
  syl: number;
  tags: string[];
  m: string; // meaning
  s: string; // everyday sentence
  t: string; // topic
  x?: string; // common Indian English mistake
  r: number; // how common (lower = more common)
};

export const TAGS: Record<string, { label: string; short: string; tip: string }> = {
  vw: { label: "V and W", short: "V/W", tip: "V: top teeth touch your bottom lip. W: round your lips like “oo”, and your teeth don’t touch." },
  th: { label: "TH sounds", short: "TH", tip: "Put your tongue tip between your teeth. It is not T or D." },
  z: { label: "The Z sound", short: "Z", tip: "Z is a buzzing S. Keep your tongue behind your teeth and let your voice buzz. It is not J." },
  stress: { label: "Word stress", short: "Stress", tip: "Say the syllable in CAPITALS longer and louder. The other syllables get short and soft." },
  hidden: { label: "Hidden syllables", short: "Fewer syllables", tip: "Some letters are skipped when you speak, so the word has fewer syllables than it looks." },
  silent: { label: "Silent letters", short: "Silent letter", tip: "One letter is written but not said." },
  ed: { label: "-ed endings", short: "-ed", tip: "After most sounds, -ed is just a quick T or D. Only after T or D does it become an extra “id”." },
  scluster: { label: "S + consonant", short: "S start", tip: "Start straight with the S. Don’t add an “i” or “e” before it (not “ischool”)." },
  ae: { label: "A as in “cat”", short: "A (cat)", tip: "Open your mouth wide and pull your lips back a little. Not “e” and not “aa”." },
  oh: { label: "O as in “go”", short: "O (go)", tip: "Start with “o” and glide to a small “oo” at the end: “oh-oo”." },
  spell: { label: "Tricky spellings", short: "Spelling", tip: "The spelling doesn’t match the sound here. Trust your ears, not the letters." },
};

export const TAG_ORDER = ["vw", "th", "stress", "silent", "hidden", "z", "scluster", "spell", "ae", "oh", "ed"];

let cache: Promise<Word[]> | null = null;
export function loadWords(): Promise<Word[]> {
  cache ??= fetch("/words/words.json").then((r) => {
    if (!r.ok) throw new Error("Word list not found");
    return r.json();
  });
  cache.catch(() => (cache = null));
  return cache;
}

// ── Progress for each word ──────────────────────────────────────────

export type WordStat = { tries: number; right: number; streak: number; last: number; lastRight: boolean; sentence?: number };
export const wordKey = (w: string) => `word:${w}`;
export const isLearned = (s?: WordStat) => Boolean(s && s.streak >= 2);

export async function recordWord(w: string, right: boolean) {
  const cur = (await read<WordStat>(wordKey(w))) ?? { tries: 0, right: 0, streak: 0, last: 0, lastRight: false };
  const next: WordStat = { ...cur, tries: cur.tries + 1, right: cur.right + (right ? 1 : 0), streak: right ? cur.streak + 1 : 0, last: Date.now(), lastRight: right };
  await write(wordKey(w), next);
  return next;
}

export async function recordSentence(w: string, score: number) {
  const cur = (await read<WordStat>(wordKey(w))) ?? { tries: 0, right: 0, streak: 0, last: 0, lastRight: false };
  await write(wordKey(w), { ...cur, sentence: Math.max(cur.sentence ?? 0, score), last: Date.now() });
}

/** Ten words for today: ones you got wrong first, then new common words. */
export function pickSession(words: Word[], stats: Map<string, WordStat>, size = 10) {
  const missed = words.filter((w) => stats.get(w.w) && !stats.get(w.w)!.lastRight).sort((a, b) => stats.get(a.w)!.last - stats.get(b.w)!.last);
  const shaky = words.filter((w) => stats.get(w.w)?.lastRight && !isLearned(stats.get(w.w)));
  const fresh = words.filter((w) => !stats.get(w.w));
  // Skip the very short everyday words (you know them already); two harder words for every medium one.
  const longer = fresh.filter((w) => w.w.length >= 6 && w.r >= 700);
  const isHard = (w: Word) => w.tags.length >= 2 || w.syl >= 3;
  const hard = longer.filter(isHard);
  const medium = longer.filter((w) => !isHard(w));
  const mixed: Word[] = [];
  for (let k = 0; mixed.length < size * 2 && (hard.length || medium.length); k++) {
    const next = k % 3 === 2 ? medium.shift() ?? hard.shift() : hard.shift() ?? medium.shift();
    if (next) mixed.push(next);
  }
  return [...missed.slice(0, 4), ...shaky.slice(0, 2), ...mixed].slice(0, size);
}
