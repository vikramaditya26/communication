"use client";

import { read, today, write } from "./store";

// The grammar course is built by scripts/build-grammar.mjs into public/grammar/.

export type Exercise =
  | { k: "pick"; q: string; o: string[]; a: number; y?: string }
  | { k: "spot"; q: string; w: string; r: string; at: number; fixed: string; y?: string }
  | { k: "type"; q: string; a: string[]; y?: string }
  | { k: "order"; a: string; alt?: string[]; y?: string }
  | { k: "say"; q: string; a: string[]; y?: string };

export type Lesson = {
  id: string;
  n: number;
  unit: number;
  title: string;
  goal: string;
  wm?: string;
  intro: string;
  rules: { rule: string; examples: string[] }[];
  mistakes: { wrong: string; right: string; why: string }[];
  ex: Exercise[];
  talk: string;
};

export type LessonInfo = { id: string; n: number; title: string; goal: string; count: number };
export type Unit = { n: number; title: string; note: string; lessons: LessonInfo[] };

let index: Promise<Unit[]> | null = null;
export function loadCourse(): Promise<Unit[]> {
  index ??= fetch("/grammar/index.json").then((r) => {
    if (!r.ok) throw new Error("Grammar course not found");
    return r.json();
  });
  index.catch(() => (index = null));
  return index;
}

const lessons = new Map<string, Promise<Lesson>>();
export function loadLesson(id: string): Promise<Lesson> {
  if (!lessons.has(id)) {
    const p = fetch(`/grammar/${id}.json`).then((r) => {
      if (!r.ok) throw new Error("Lesson not found");
      return r.json() as Promise<Lesson>;
    });
    p.catch(() => lessons.delete(id));
    lessons.set(id, p);
  }
  return lessons.get(id)!;
}

// ── Checking answers ─────────────────────────────────────────────────

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, "cannot"],
  [/\bwon't\b/g, "will not"],
  [/\bshan't\b/g, "shall not"],
  [/\bain't\b/g, "is not"],
  [/n't\b/g, " not"],
  [/'m\b/g, " am"],
  [/'re\b/g, " are"],
  [/'ve\b/g, " have"],
  [/'ll\b/g, " will"],
  [/'d\b/g, " would"],
  [/\b(he|she|it|that|there|what|who|where|here)'s\b/g, "$1 is"],
  [/\blet's\b/g, "let us"],
];

/** Lowercase words only, with contractions spelled out, so "I'm" and "I am" count as the same answer. */
export function normalizeAnswer(text: string) {
  let t = text.toLowerCase().replace(/[’‘`]/g, "'");
  for (const [re, to] of CONTRACTIONS) t = t.replace(re, to);
  return t
    .replace(/\bcan not\b/g, "cannot")
    .replace(/\bok\b/g, "okay")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Does a typed or spoken answer match one of the accepted answers? An answer ending in * only has to match the start. */
export function answerMatches(given: string, accepted: string[]) {
  const g = normalizeAnswer(given);
  if (!g) return false;
  return accepted.some((a) => {
    const prefix = a.endsWith("*");
    const want = normalizeAnswer(prefix ? a.slice(0, -1) : a);
    return prefix ? g === want || g.startsWith(want + " ") : g === want;
  });
}

/** The full correct sentence for an exercise, to show and to read aloud. */
export function correctSentence(e: Exercise) {
  switch (e.k) {
    case "pick": {
      const parts = e.o[e.a].split(" / ");
      let i = 0;
      return e.q.replace(/___/g, () => parts[Math.min(i++, parts.length - 1)]).replace(/\s—(?=[\s.,?!])/g, "").replace(/\s{2,}/g, " ");
    }
    case "spot":
      return e.fixed;
    case "type":
      // Drop hints like "(watch)" or "(yes/no)".
      return e.q.replace("___", e.a[0]).replace(/\s*\([^)]*\)/g, "");
    case "order":
      return e.a;
    case "say": {
      const a = e.a[0];
      if (a.endsWith("*")) return `${a.slice(0, -1)}…`;
      if (/[.?!]$/.test(a)) return a;
      const question = /^(is|are|am|was|were|do|does|did|can|could|would|will|shall|should|may|have|has|where|what|why|how|when|who|which)\b/i.test(a);
      return a + (question ? "?" : ".");
    }
  }
}

// ── Progress ─────────────────────────────────────────────────────────

export type LessonStat = { best: number; done: boolean; tries: number; last: number; doneOn?: string; talked?: boolean };
export const lessonKey = (id: string) => `grammar:lesson:${id}`;
export const PASS = 70;

export type GrammarMiss = { lesson: string; i: number; wrong: number; last: number; fixed: boolean };
export const missKey = (lesson: string, i: number) => `grammar:miss:${lesson}:${i}`;

export async function finishLesson(id: string, score: number) {
  const cur = await read<LessonStat>(lessonKey(id));
  const pass = score >= PASS;
  const next: LessonStat = {
    best: Math.max(cur?.best ?? 0, score),
    done: Boolean(cur?.done || pass),
    tries: (cur?.tries ?? 0) + 1,
    last: Date.now(),
    doneOn: cur?.doneOn ?? (pass ? today() : undefined),
    talked: cur?.talked,
  };
  await write(lessonKey(id), next);
  return next;
}

export async function markTalked(id: string) {
  const cur = await read<LessonStat>(lessonKey(id));
  if (cur) await write(lessonKey(id), { ...cur, talked: true });
}

/** Remember which exercises went wrong, so they come back in the warm-up. */
export async function recordResult(lesson: string, i: number, right: boolean) {
  const key = missKey(lesson, i);
  const cur = await read<GrammarMiss>(key);
  if (right) {
    if (cur && !cur.fixed) await write(key, { ...cur, fixed: true, last: Date.now() });
    return;
  }
  await write<GrammarMiss>(key, { lesson, i, wrong: (cur?.wrong ?? 0) + 1, last: Date.now(), fixed: false });
}

/** Lesson n is open once lesson n-1 is done. */
export function isUnlocked(n: number, order: LessonInfo[], stats: Map<string, LessonStat>) {
  if (n <= 1) return true;
  const prev = order.find((l) => l.n === n - 1);
  return !prev || Boolean(stats.get(prev.id)?.done);
}
