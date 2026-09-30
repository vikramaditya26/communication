"use client";

import { useSyncExternalStore } from "react";

// Browser speech: listening (speech-to-text), speaking (text-to-speech),
// recording the learner's voice, and comparing what was read with what was heard.

// ── Words ────────────────────────────────────────────────────────────

export const normalizeWord = (w: string) =>
  w
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']/g, "")
    .replace(/^'+|'+$/g, "");

/** Splits text into words the way the reader shows them (keeps punctuation attached). */
export const splitWords = (text: string) => text.split(/(\s+|—|–)/).filter((t) => t.length > 0);

const NUMBERS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
  "10": "ten", "11": "eleven", "12": "twelve", "20": "twenty", "100": "hundred", "1000": "thousand",
};

// British and American spellings of the same word ("colour"/"color", "realise"/"realize").
const canonical = (w: string) =>
  w
    .replace(/our(s?)$/, "or$1")
    .replace(/is(e|ed|es|ing)$/, "iz$1")
    .replace(/tre(s?)$/, "ter$1")
    .replace(/ll(ed|ing|er)$/, "l$1")
    .replace(/'/g, "");

// Words that sound the same. The recogniser picks one at random, so they are never a mistake.
const HOMOPHONES = [
  "to too two", "there their theyre", "for four fore", "your youre", "its", "no know", "right write", "here hear", "one won", "by buy bye",
  "see sea", "would wood", "which witch", "whole hole", "new knew", "our hour", "be bee", "son sun", "i eye", "ate eight", "through threw",
  "week weak", "peace piece", "wait weight", "weather whether", "where wear", "were whir", "then than", "of off", "who whom", "an and",
  "role roll", "sight site", "soul sole", "tale tail", "way weigh", "made maid", "meet meat", "plain plane", "rain reign", "red read",
  "road rode", "sail sale", "seen scene", "some sum", "steal steel", "wave waive", "heard herd", "night knight", "not knot", "o oh",
  "thou though", "thee the", "thy the", "ere air", "hath has", "doth does", "shall shell", "whose whos", "led lead", "passed past",
].flatMap((group) => {
  const words = group.split(" ");
  return words.map((w) => [w, words] as const);
});
const SOUNDS_LIKE = new Map<string, readonly string[]>(HOMOPHONES);

function similar(a: string, b: string) {
  if (a === b) return true;
  if (NUMBERS[a] === b || NUMBERS[b] === a) return true;
  if (SOUNDS_LIKE.get(a.replace(/'/g, ""))?.includes(b.replace(/'/g, ""))) return true;
  const x = canonical(a), y = canonical(b);
  if (x === y) return true;
  // Only forgive a different ending ("walk"/"walks"/"walked"). A different sound inside
  // the word ("vest"/"west", "ship"/"sheep") is exactly the mistake we want to catch.
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && long.startsWith(short) && long.length - short.length <= 2;
}


export const wordsMatch = (a: string, b: string) => similar(normalizeWord(a), normalizeWord(b));

export type WordMark = { mark: "good" | "bad" | "skip"; heard?: string };

/**
 * Aligns the words on the page with the words the recogniser heard.
 * Returns one mark per expected word.
 */
export function alignReading(expected: string[], heardText: string): WordMark[] {
  const E = expected.map(normalizeWord);
  const H = heardText.split(/\s+/).map(normalizeWord).filter(Boolean);
  const n = E.length, m = H.length;
  const cost = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  const move = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 diag, 2 up (skip expected), 3 left (extra heard)
  for (let i = 1; i <= n; i++) { cost[i][0] = i; move[i][0] = 2; }
  for (let j = 1; j <= m; j++) { cost[0][j] = j; move[0][j] = 3; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = cost[i - 1][j - 1] + (E[i - 1] === "" || similar(E[i - 1], H[j - 1]) ? 0 : 1);
      const up = cost[i - 1][j] + 1;
      const left = cost[i][j - 1] + 1;
      if (diag <= up && diag <= left) { cost[i][j] = diag; move[i][j] = 1; }
      else if (up <= left) { cost[i][j] = up; move[i][j] = 2; }
      else { cost[i][j] = left; move[i][j] = 3; }
    }
  }
  // The learner reads from the start but may not have reached the end yet, so the words
  // after the point they reached are free: pick the end point that fits what was heard best.
  // On a tie, the earlier point wins (people read from the start).
  let end = 0;
  for (let k = 1; k <= n; k++) if (cost[k][m] < cost[end][m]) end = k;
  const marks: WordMark[] = new Array(n).fill(null).map(() => ({ mark: "skip", heard: "__unread" }) as WordMark);
  let i = end, j = m;
  while (i > 0 || j > 0) {
    const mv = move[i][j];
    if (i > 0 && j > 0 && mv === 1) {
      const ok = E[i - 1] === "" || similar(E[i - 1], H[j - 1]);
      marks[i - 1] = ok ? { mark: "good" } : { mark: "bad", heard: H[j - 1] };
      i--; j--;
    } else if (i > 0 && (mv === 2 || j === 0)) {
      marks[i - 1] = E[i - 1] === "" ? { mark: "good" } : { mark: "skip" };
      i--;
    } else {
      j--;
    }
  }
  // Words the learner never reached (they stopped early) are not mistakes.
  let lastHeard = marks.length - 1;
  while (lastHeard >= 0 && marks[lastHeard].mark === "skip") lastHeard--;
  return marks.map((mk, idx) => (idx > lastHeard ? { mark: "skip", heard: "__unread" } : mk));
}

/** How many real words are in a piece of heard text (used to remember where a jump happened). */
export const countHeard = (heardText: string) => heardText.split(/\s+/).map(normalizeWord).filter(Boolean).length;

export type Jump = { at: number; to: number };

/**
 * Follows a learner reading a page aloud, word by word, and always moves forward.
 *
 * - A heard word is matched with the next few words on the page, so one wrong word never blocks the rest.
 * - If three heard words in a row match nothing, the word being attempted is marked red and the reader moves on.
 * - Saying an earlier red or missed word again, correctly, turns it green.
 * - `start` is the word to begin at; `jumps` move the reader when they tap a word (after `at` heard words, go to word `to`).
 *
 * Returns one mark per word on the page, and `pos`: the next word to read.
 */
export function followReading(expected: string[], heardText: string, opts: { start?: number; jumps?: Jump[] } = {}): { marks: WordMark[]; pos: number } {
  const E = expected.map(normalizeWord);
  const H = heardText.split(/\s+/).map(normalizeWord).filter(Boolean);
  const n = E.length;
  const marks: WordMark[] = Array.from({ length: n }, () => ({ mark: "skip", heard: "__unread" }) as WordMark);
  const real = (i: number) => {
    while (i < n && !E[i]) i++;
    return i;
  };
  const jumps = [...(opts.jumps ?? [])].sort((a, b) => a.at - b.at);
  let jumped = 0;
  let pos = real(opts.start ?? 0);
  let pending: string[] = [];
  // Heard words up to here are getting a second look after a forced move; they don't count towards the next one.
  let secondLook = -1;
  let fresh = 0;

  for (let j = 0; j <= H.length; j++) {
    while (jumped < jumps.length && jumps[jumped].at <= j) {
      pos = real(jumps[jumped++].to);
      pending = [];
      fresh = 0;
    }
    if (j === H.length || pos >= n) break;
    const h = H[j];

    // Look at the word we are waiting for, then a few words ahead (short words like "the" are everywhere, so only one ahead).
    const reach = h.length <= 3 ? (pending.length ? 3 : 1) : 5;
    let found = -1;
    let usedTwoHeard = false;
    let usedTwoExpected = false;
    for (let k = pos, step = 0; k < n && step <= reach; k = real(k + 1), step++) {
      const next = real(k + 1);
      // "every one" heard for "everyone", or "cannot" heard for "can not".
      usedTwoHeard = !similar(E[k], h) && j + 1 < H.length && E[k].length > 4 && similar(E[k], h + H[j + 1]);
      usedTwoExpected = !similar(E[k], h) && !usedTwoHeard && next < n && h.length > 4 && similar(E[k] + E[next], h);
      if (similar(E[k], h) || usedTwoHeard || usedTwoExpected) {
        found = k;
        break;
      }
    }

    if (found >= 0) {
      // Words jumped over: pair them with what was heard in between (red), or mark them as not heard (yellow).
      for (let k = pos; k < found; k = real(k + 1)) marks[k] = pending.length ? { mark: "bad", heard: pending.shift() } : { mark: "skip" };
      marks[found] = { mark: "good" };
      let after = real(found + 1);
      if (usedTwoExpected && after < n) {
        marks[after] = { mark: "good" };
        after = real(after + 1);
      }
      if (usedTwoHeard) j++;
      pos = after;
      pending = [];
      fresh = 0;
      continue;
    }

    // Said again: a word from the last couple of lines. If it was red or missed, it is fixed now.
    let again = -1;
    for (let k = pos - 1, step = 0; k >= 0 && step < 14; k--) {
      if (!E[k]) continue;
      step++;
      if (similar(E[k], h)) {
        again = k;
        break;
      }
    }
    if (again >= 0) {
      if (marks[again].heard !== "__unread") marks[again] = { mark: "good" };
      continue;
    }

    pending.push(h);
    if (j > secondLook) fresh++;
    if (fresh >= 3) {
      // Three new words that match nothing: mark the word being tried and move on,
      // then give the other heard words a second look from the new place.
      marks[pos] = { mark: "bad", heard: pending[0] };
      pos = real(pos + 1);
      secondLook = j;
      j -= pending.length - 1;
      pending = [];
      fresh = 0;
    }
  }
  return { marks, pos: Math.min(pos, n) };
}

// ── Listening ────────────────────────────────────────────────────────

type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function speechRecognitionSupported() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export type Listener = { stop: () => void };

/**
 * Listens until stop() is called. Browsers end recognition after silence,
 * so this restarts it and keeps everything that was heard.
 */
const plain = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

/** Adds a newly heard piece to what was heard before, without repeating words the browser sent twice. */
function joinHeard(before: string, piece: string) {
  const a = plain(before);
  const b = plain(piece);
  if (!b) return before;
  if (!a) return piece.trim();
  // Android Chrome: each new result contains everything said so far.
  if (b.startsWith(a)) return piece.trim();
  // The same piece sent twice.
  if (a === b || a.endsWith(" " + b)) return before;
  return `${before} ${piece.trim()}`;
}

export function listen(opts: {
  lang?: string;
  onText: (finalText: string, interim: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}): Listener | null {
  const w = window as unknown as Record<string, new () => Recognition>;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;

  let finalText = "";
  let stopped = false;
  let rec: Recognition;

  const start = () => {
    rec = new Ctor();
    rec.lang = opts.lang ?? "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    let sessionFinal = "";
    let sessionInterim = "";
    rec.onresult = (e) => {
      let interim = "";
      sessionFinal = "";
      for (let k = 0; k < e.results.length; k++) {
        const r = e.results[k];
        if (r.isFinal) sessionFinal = joinHeard(sessionFinal, r[0].transcript);
        else interim = joinHeard(interim, r[0].transcript);
      }
      // The words still being worked out sometimes repeat the finished ones; keep only the new part.
      const done = plain(sessionFinal);
      if (done && plain(interim).startsWith(done)) interim = plain(interim).slice(done.length);
      sessionInterim = interim.trim();
      opts.onText(`${finalText} ${sessionFinal}`.trim(), interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      stopped = true;
      opts.onError?.(e.error);
    };
    rec.onend = () => {
      // Phones sometimes end a session without confirming the last words. Keep them anyway.
      finalText = `${finalText} ${sessionFinal} ${sessionInterim}`.replace(/\s+/g, " ").trim() + " ";
      if (stopped) {
        opts.onText(finalText.trim(), "");
        opts.onEnd?.();
      } else {
        try {
          start();
        } catch {
          opts.onEnd?.();
        }
      }
    };
    rec.start();
  };

  start();
  return {
    stop: () => {
      stopped = true;
      try {
        rec.stop();
      } catch {}
    },
  };
}

// ── Recording ────────────────────────────────────────────────────────

export const isMobile = () => typeof navigator !== "undefined" && /Android|iPhone|iPad/i.test(navigator.userAgent);

export async function startRecorder(): Promise<{ stop: () => Promise<Blob | null> } | null> {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start(1000);
    return {
      stop: () =>
        new Promise((resolve) => {
          recorder.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null);
          };
          recorder.stop();
        }),
    };
  } catch {
    return null;
  }
}

// ── Speaking ─────────────────────────────────────────────────────────

let cachedVoices: SpeechSynthesisVoice[] = [];

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve((cachedVoices = now));
  return new Promise((resolve) => {
    const done = () => resolve((cachedVoices = speechSynthesis.getVoices()));
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

const PREFERRED = ["Google US English", "Samantha", "Microsoft Aria", "Microsoft Jenny", "Alex", "Ava", "Allison"];

export function pickVoice(name?: string | null) {
  const en = cachedVoices.filter((v) => v.lang.replace("_", "-").startsWith("en-US"));
  return (
    (name && cachedVoices.find((v) => v.name === name)) ||
    PREFERRED.map((p) => en.find((v) => v.name.includes(p))).find(Boolean) ||
    en[0] ||
    cachedVoices.find((v) => v.lang.startsWith("en")) ||
    null
  );
}

export function speak(
  text: string,
  opts: { rate?: number; voice?: string | null; onWord?: (charIndex: number) => void; onEnd?: () => void } = {},
) {
  if (typeof speechSynthesis === "undefined") return () => {};
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(opts.voice);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "en-US";
  u.rate = opts.rate ?? 0.95;
  u.onboundary = (e) => e.name === "word" && opts.onWord?.(e.charIndex);
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  speechSynthesis.speak(u);
  return () => speechSynthesis.cancel();
}

export const stopSpeaking = () => typeof speechSynthesis !== "undefined" && speechSynthesis.cancel();

/** Listens for one short answer (a word or two). Resolves with what was heard, or "" after `maxMs`. */
export function listenOnce(maxMs = 4000): Promise<string> {
  return new Promise((resolve) => {
    let heard = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(heard.trim());
    };
    const l = listen({
      onText: (finalText, interim) => {
        heard = `${finalText} ${interim}`.trim();
        if (finalText) l?.stop();
      },
      onError: finish,
      onEnd: finish,
    });
    if (!l) return finish();
    const timer = setTimeout(() => l.stop(), maxMs);
  });
}

const noSubscribe = () => () => {};
/** Hydration-safe check: assumes support while rendering on the server. */
export function useSpeechSupported() {
  return useSyncExternalStore(noSubscribe, speechRecognitionSupported, () => true);
}
