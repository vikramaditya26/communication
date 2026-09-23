"use client";

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

function similar(a: string, b: string) {
  if (a === b) return true;
  if (NUMBERS[a] === b || NUMBERS[b] === a) return true;
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
    rec.onresult = (e) => {
      let interim = "";
      sessionFinal = "";
      for (let k = 0; k < e.results.length; k++) {
        const r = e.results[k];
        if (r.isFinal) sessionFinal += r[0].transcript + " ";
        else interim += r[0].transcript + " ";
      }
      opts.onText((finalText + sessionFinal).trim(), interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      stopped = true;
      opts.onError?.(e.error);
    };
    rec.onend = () => {
      finalText = (finalText + sessionFinal).trim() + " ";
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
