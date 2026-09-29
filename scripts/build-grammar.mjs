// Builds the grammar course from scripts/grammar/unit-*.mjs into public/grammar/.
//
//   node scripts/build-grammar.mjs
//
// The course follows the order of Wren & Martin's "High School English Grammar and Composition",
// but every explanation and exercise is written fresh for spoken English and common Indian-English mistakes.
//
// Lesson format (short keys keep the lesson files easy to read):
//   id, title, goal, wm (the matching Wren & Martin topic), intro,
//   rules:    [rule, example, example?]
//   mistakes: [wrong, right, why]
//   ex:       exercises, one of
//     ["pick",  "She ___ in a bank.", ["work", "works"], 1, why]      choose the right word
//     ["spot",  "He don't like tea.", "don't", "doesn't", why]         tap the mistake
//     ["type",  "I've lived here ___ 2015.", ["since"], why]           type the missing word
//     ["order", "Where does your brother work?", why, [other orders]]  put the words in order
//     ["say",   "Make it a question: You live in Pune.", ["Do you live in Pune?"], why]  say it aloud
//               (an answer ending in * only has to start with those words, e.g. "Hi I am*")
//   talk: a speaking task the AI coach checks

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "scripts/grammar");
const OUT = path.join(ROOT, "public/grammar");

const problems = [];
const bad = (where, msg) => problems.push(`${where}: ${msg}`);

function exercise(e, where) {
  const [k] = e;
  if (k === "pick") {
    const [, q, o, a, y] = e;
    if (!q.includes("___")) bad(where, `no blank in "${q}"`);
    if (!Array.isArray(o) || o.length < 2 || a < 0 || a >= o.length) bad(where, `bad options/answer in "${q}"`);
    if (new Set(o).size !== o.length) bad(where, `repeated option in "${q}"`);
    return { k, q, o, a, y };
  }
  if (k === "spot") {
    const [, q, w, r, y] = e;
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match whole words only (so "is" doesn't match inside "this").
    const re = new RegExp(`(${/^[A-Za-z]/.test(w) ? "^|[^A-Za-z']" : ""})${esc}${/[A-Za-z]$/.test(w) ? "(?=$|[^A-Za-z'])" : ""}`);
    const m = q.match(re);
    if (!m) {
      bad(where, `"${w}" not found in "${q}"`);
      return { k, q, w, r, fixed: q, at: 0, y };
    }
    const at = m.index + m[1].length;
    const fixed = (q.slice(0, at) + r + q.slice(at + w.length)).replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").replace(/,\s*,/g, ",").trim();
    return { k, q, w, r, at, fixed: fixed[0].toUpperCase() + fixed.slice(1), y };
  }
  if (k === "type") {
    const [, q, a, y] = e;
    if (!q.includes("___")) bad(where, `no blank in "${q}"`);
    if (!Array.isArray(a) || !a.length) bad(where, `no answers for "${q}"`);
    return { k, q, a, y };
  }
  if (k === "order") {
    const [, a, y, alt] = e;
    if (a.split(" ").length < 3) bad(where, `too short to order: "${a}"`);
    if (alt && alt.some((x) => x.split(" ").sort().join(" ") !== a.split(" ").sort().join(" "))) bad(where, `alternative uses different words: "${a}"`);
    return { k, a, y, alt };
  }
  if (k === "say") {
    const [, q, a, y] = e;
    if (!Array.isArray(a) || !a.length) bad(where, `no answers for "${q}"`);
    return { k, q, a, y };
  }
  bad(where, `unknown exercise type ${k}`);
  return null;
}

const files = (await fs.readdir(SRC)).filter((f) => /^unit-\d+\.mjs$/.test(f)).sort();
const units = [];
const seen = new Set();
let n = 0;
for (const f of files) {
  const { unit } = await import(path.join(SRC, f));
  const lessons = [];
  for (const l of unit.lessons) {
    n++;
    const where = `${f} ${l.id}`;
    if (seen.has(l.id)) bad(where, "duplicate id");
    seen.add(l.id);
    for (const key of ["id", "title", "goal", "intro", "rules", "mistakes", "ex", "talk"]) if (!l[key]) bad(where, `missing ${key}`);
    const ex = (l.ex ?? []).map((e, i) => exercise(e, `${where} #${i + 1}`)).filter(Boolean);
    if (ex.length < 8) bad(where, `only ${ex.length} exercises`);
    lessons.push({
      id: l.id,
      n,
      unit: unit.n,
      title: l.title,
      goal: l.goal,
      wm: l.wm,
      intro: l.intro,
      rules: l.rules.map(([rule, ...examples]) => ({ rule, examples })),
      mistakes: l.mistakes.map(([wrong, right, why]) => ({ wrong, right, why })),
      ex,
      talk: l.talk,
    });
  }
  units.push({ n: unit.n, title: unit.title, note: unit.note, lessons });
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
for (const u of units) for (const l of u.lessons) await fs.writeFile(path.join(OUT, `${l.id}.json`), JSON.stringify(l));
await fs.writeFile(
  path.join(OUT, "index.json"),
  JSON.stringify(units.map((u) => ({ ...u, lessons: u.lessons.map((l) => ({ id: l.id, n: l.n, title: l.title, goal: l.goal, count: l.ex.length })) }))),
);
console.log(`${n} lessons in ${units.length} units, ${units.reduce((s, u) => s + u.lessons.reduce((t, l) => t + l.ex.length, 0), 0)} exercises`);
