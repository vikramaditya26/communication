// Builds the pronunciation word list: everyday words that Indian English speakers often say differently
// from American English, with meanings, example sentences and easy-to-read pronunciation guides.
//
//   node scripts/build-words.mjs            # pick words, add meanings with Gemini, write public/words/words.json
//   node scripts/build-words.mjs --pick     # only show which words would be picked
//   node scripts/build-words.mjs --write-only  # write the file from meanings already fetched (no Gemini calls)
//
// Sources (downloaded into .cache/words/):
//   cmudict.dict  CMU Pronouncing Dictionary (American pronunciations)   github.com/cmusphinx/cmudict
//   en_50k.txt    word frequencies from film and TV subtitles            github.com/hermitdave/FrequencyWords
// Meanings, sentences and topics are written once by Gemini (GEMINI_API_KEY in .env.local) and cached.

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, ".cache/words");
const OUT = path.join(ROOT, "public/words/words.json");
const TARGET = 2600;

// Well-known words that Indian speakers often say differently. Always included.
const HANDPICKED = `vegetable comfortable wednesday february island receipt salmon almond often debris genre suite pizza colonel
entrepreneur hotel develop determine event idea picture pitcher walk work world girl word worm warm won't want bowl cupboard subtle
doubt debt hierarchy ask asked clothes months sixth twelfth burger pronunciation pronounce mischievous especially library probably
temperature interesting chocolate different every family business restaurant laboratory schedule route tomb sword wolf women woman
although through thorough thought though tough cough enough knowledge psychology recipe epitome hyperbole cache niche facade bouquet
ballet buffet gauge height weight weird foreign queue choir chaos character chemistry stomach mechanic machine chef aisle iron
nuclear jewelry athlete mischief prescription vehicle vegan vitamin volunteer visa vowel west vest wine vine value village welcome
weather whether ward variety video violence wallet wardrobe zero zone zebra lazy busy closet cloth three thirty thanks thirsty
thursday month mouth breathe breath bath bathe birthday other mother brother together rhythm ethics theme thyme photo photographer
photography economy economic career canal police success percent guitar cartoon desert dessert record present object content
increase address advertisement comment analysis analyze category colleague prefer preference occur component opportunity ability
available environment government particular specifically necessary secretary communication vocabulary generally literally actually
delivery primarily temporarily sandwich salad banana tomato potato onion garlic coffee yogurt cereal pasta lettuce broccoli cucumber
biscuit dessert menu buffet cafe caramel quinoa croissant spinach cabbage cauliflower mayonnaise ketchup mustard sauce
office manager meeting deadline project client customer employee employer interview resume salary budget invoice presentation
laptop keyboard software hardware password wifi email internet website download upload battery charger
doctor medicine pharmacy hospital surgery fever headache allergy injury muscle stomach throat thermometer
airport passport luggage journey hotel reservation vacation ticket departure arrival
weekend weekday tomorrow yesterday tonight morning evening afternoon calendar
comfortable uncomfortable vulnerable valuable available variable probably definitely obviously apparently
`.split(/\s+/).filter(Boolean);

// Everyday words only: skip names and rude words even if they are frequent in subtitles.
const BLOCK = new Set(`fuck fucking fucked fucker shit shitty bitch bastard damn dammit goddamn asshole dick pussy cock whore slut nigger
sexy sex porn penis vagina boobs`.split(/\s+/));

const VOWELS = new Set(["AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"]);
const base = (p) => p.replace(/\d/g, "");
const isVowel = (p) => VOWELS.has(base(p));

// ── Pronunciation guides ────────────────────────────────────────────

const IPA = { AA: "ɑ", AE: "æ", AO: "ɔ", AW: "aʊ", AY: "aɪ", EH: "ɛ", EY: "eɪ", IH: "ɪ", IY: "i", OW: "oʊ", OY: "ɔɪ", UH: "ʊ", UW: "u",
  B: "b", CH: "tʃ", D: "d", DH: "ð", F: "f", G: "ɡ", HH: "h", JH: "dʒ", K: "k", L: "l", M: "m", N: "n", NG: "ŋ", P: "p", R: "r", S: "s",
  SH: "ʃ", T: "t", TH: "θ", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ" };
// Respelling meant to be read naturally by Indian English speakers ("ai" as in "hai", "ee" as in "see").
const SAY = { AA: "ah", AE: "a", AH: "uh", AO: "aw", AW: "ow", AY: "ai", EH: "e", ER: "er", EY: "ay", IH: "i", IY: "ee", OW: "oh",
  OY: "oy", UH: "u", UW: "oo", B: "b", CH: "ch", D: "d", DH: "th", F: "f", G: "g", HH: "h", JH: "j", K: "k", L: "l", M: "m", N: "n",
  NG: "ng", P: "p", R: "r", S: "s", SH: "sh", T: "t", TH: "th", V: "v", W: "w", Y: "y", Z: "z", ZH: "zh" };
const ONSETS = new Set(["P R", "T R", "K R", "B R", "D R", "G R", "F R", "TH R", "SH R", "P L", "K L", "B L", "G L", "F L", "S L",
  "S P", "S T", "S K", "S M", "S N", "S W", "T W", "K W", "D W", "S P R", "S T R", "S K R", "S P L", "S K W", "P Y", "K Y", "B Y",
  "F Y", "M Y", "HH Y", "V Y"]);

/** Splits phones into syllables, giving consonants to the following syllable where English allows it. */
function syllables(phones) {
  const nuclei = phones.map((p, i) => (isVowel(p) ? i : -1)).filter((i) => i >= 0);
  if (!nuclei.length) return [phones];
  const cuts = [0];
  for (let k = 1; k < nuclei.length; k++) {
    const between = phones.slice(nuclei[k - 1] + 1, nuclei[k]).map(base);
    let onset = between.length ? 1 : 0;
    for (let n = Math.min(3, between.length); n >= 2; n--) if (ONSETS.has(between.slice(-n).join(" "))) { onset = n; break; }
    if (between.length && between[between.length - 1] === "NG") onset = 0;
    cuts.push(nuclei[k] - onset);
  }
  return cuts.map((c, k) => phones.slice(c, cuts[k + 1] ?? phones.length));
}

function guides(phones) {
  const syls = syllables(phones);
  const stressOf = (syl) => Number(syl.find(isVowel)?.slice(-1) ?? 0);
  const ipa = syls
    .map((syl) => {
      const st = stressOf(syl);
      const s = syl.map((p) => (base(p) === "AH" ? (st === 1 ? "ʌ" : "ə") : base(p) === "ER" ? (st ? "ɝ" : "ɚ") : IPA[base(p)])).join("");
      return (st === 1 ? "ˈ" : st === 2 && syls.length > 2 ? "ˌ" : "") + s;
    })
    .join("");
  const say = syls
    .map((syl) => {
      const s = syl.map((p) => SAY[base(p)]).join("");
      return stressOf(syl) === 1 && syls.length > 1 ? s.toUpperCase() : s;
    })
    .join("-");
  return { ipa: `/${ipa}/`, say, syl: syls.length, stress: syls.findIndex((s) => stressOf(s) === 1) };
}

// ── Trouble spots ────────────────────────────────────────────────────

function tagsFor(word, phones) {
  const b = phones.map(base);
  const syl = phones.filter(isVowel).length;
  const primary = phones.filter(isVowel).findIndex((p) => p.endsWith("1"));
  const tags = [];
  if (b.includes("V") || b.includes("W")) tags.push("vw");
  if (b.includes("TH") || b.includes("DH")) tags.push("th");
  if (b.includes("ZH") || /z/.test(word) || b.slice(0, -1).includes("Z")) tags.push("z");
  if ((syl >= 2 && primary > 0) || syl >= 4) tags.push("stress");
  // More vowel groups on paper than syllables when spoken ("vegetable", "different").
  const written = (word.replace(/e$/, "").match(/[aeiouy]+/g) ?? []).length + (/[^aeiouy]le$/.test(word) ? 1 : 0);
  if (written > syl && syl >= 2) tags.push("hidden");
  const silent =
    (/^kn/.test(word) && b[0] === "N") || (/^wr/.test(word) && b[0] === "R") || /mb$/.test(word) || (/^ps/.test(word) && b[0] === "S") ||
    (/^h/.test(word) && b[0] !== "HH") || /gn$/.test(word) || (/bt/.test(word) && !b.includes("B")) || (/st(le|en)$/.test(word) && !b.includes("T")) ||
    (/(al[km]|olk|ould)/.test(word) && !b.includes("L")) || (/isl/.test(word) && !b.includes("S")) || (/gh/.test(word) && !b.includes("G") && !b.includes("F") && syl <= 2 && /ight|ough|augh|eigh/.test(word));
  if (silent) tags.push("silent");
  if (/ed$/.test(word) && ["T", "D"].includes(b[b.length - 1])) tags.push("ed");
  if (/^s[ptkmnlw]/.test(word) && b[0] === "S") tags.push("scluster");
  if (phones.includes("AE1")) tags.push("ae");
  if (phones.includes("OW1") && /o/.test(word)) tags.push("oh");
  if ((/ch/.test(word) && b.includes("K") && !b.includes("CH")) || (/ch/.test(word) && b.includes("SH") && !b.includes("CH")) || (/^o|[^o]o[^o]/.test(word) && phones.some((p, i) => p === "AH1" && /[^aeiu]o[nvmt]/.test(word) && i < 3))) tags.push("spell");
  return tags;
}

const STRONG = new Set(["vw", "th", "z", "silent", "hidden", "scluster", "spell"]);

async function pick() {
  const dict = new Map();
  for (const line of (await fs.readFile(path.join(CACHE, "cmudict.dict"), "utf8")).split("\n")) {
    const [w, ...phones] = line.replace(/#.*$/, "").trim().split(/\s+/);
    if (w && !w.includes("(") && phones.length) dict.set(w, phones);
  }
  const freq = (await fs.readFile(path.join(CACHE, "en_50k.txt"), "utf8"))
    .split("\n")
    .map((l) => l.split(" ")[0])
    .filter(Boolean);
  const rank = new Map(freq.map((w, i) => [w, i]));

  const chosen = new Map();
  const add = (w, why) => {
    const phones = dict.get(w);
    if (!phones || chosen.has(w)) return;
    chosen.set(w, { w, phones, tags: tagsFor(w, phones), rank: rank.get(w) ?? 60000, why });
  };
  HANDPICKED.forEach((w) => add(w.toLowerCase(), "hand"));

  const stems = new Set([...chosen.keys()]);
  let edCount = 0;
  for (const w of freq.slice(0, 30000)) {
    if (chosen.size >= TARGET) break;
    if (!/^[a-z]+$/.test(w) || w.length < 5 || BLOCK.has(w) || !dict.has(w)) continue;
    // One form per word family: skip "develops" / "developing" when "develop" is in.
    const base = w.replace(/(ing|ed|es|s|ly|er|est)$/, "");
    if (stems.has(base) || stems.has(base + "e") || [...["s", "es", "ed", "ing", "ly"]].some((e) => stems.has(w.slice(0, -e.length)) && w.endsWith(e))) {
      if (!(w.endsWith("ed") && edCount < 120)) continue;
    }
    const tags = tagsFor(w, dict.get(w));
    const strong = tags.filter((t) => STRONG.has(t)).length;
    const good = strong >= 1 || (tags.includes("stress") && w.length >= 7) || (tags.includes("ed") && edCount < 120);
    if (!good) continue;
    if (tags.includes("ed")) edCount++;
    add(w, "freq");
    stems.add(w);
    stems.add(base);
  }
  return [...chosen.values()];
}

// ── Meanings and sentences (Gemini) ──────────────────────────────────

const TOPICS = ["Daily life", "Home & family", "Work & office", "Food & cooking", "Travel & places", "Health & body", "Money & shopping",
  "Tech & internet", "Feelings & people", "School & learning", "Nature & weather", "Time & numbers", "News & society"];

async function geminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const env = await fs.readFile(path.join(ROOT, ".env.local"), "utf8").catch(() => "");
  const line = env.split("\n").find((l) => /^\s*gemini_api_key\s*=/i.test(l));
  return line?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
}

async function enrich(words) {
  const cacheFile = path.join(CACHE, "enriched.json");
  const done = JSON.parse(await fs.readFile(cacheFile, "utf8").catch(() => "{}"));
  const todo = words.filter((w) => !done[w.w]);
  if (!todo.length) return done;
  const key = await geminiKey();
  if (!key) throw new Error("Add GEMINI_API_KEY to .env.local first.");

  const schema = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            word: { type: "string" },
            keep: { type: "boolean", description: "false for names, brands, rude, very rare or archaic words" },
            meaning: { type: "string", description: "simple meaning, at most 12 words, for an intermediate learner" },
            sentence: { type: "string", description: "a natural sentence people say in everyday life, 6 to 14 words, using the exact word" },
            topic: { type: "string", enum: TOPICS },
            mistake: { type: "string", description: "how Indian English speakers often mispronounce this word, in at most 14 simple words; empty if there is no common mistake" },
          },
          required: ["word", "keep", "meaning", "sentence", "topic", "mistake"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  };

  const BATCH = 40;
  const queue = [];
  for (let i = 0; i < todo.length; i += BATCH) queue.push(todo.slice(i, i + BATCH));
  let finished = 0;
  let saving = Promise.resolve();

  const ask = async (model, batch) => {
    const prompt = `For each English word below, give: a simple meaning, a natural everyday sentence using the exact word (the kind people say at home, at work, in shops, with friends), a topic, and how Indian English speakers commonly mispronounce it compared with American English (for example: W said like V, TH said like T, stress on the wrong syllable, silent letters said, extra "i" before S). Set keep to false for proper names, brands, rude words, and words too rare or old-fashioned to be useful in daily conversation.

Words: ${batch.map((w) => w.w).join(", ")}`;
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], response_format: { type: "json_schema", json_schema: { name: "words", schema, strict: true } } }),
    });
    if (!res.ok) return { status: res.status };
    const body = await res.json();
    return { items: JSON.parse(body.choices[0].message.content).items };
  };

  // Each free model has its own rate limit, so several models share the work.
  const worker = async (model) => {
    let failures = 0;
    while (queue.length) {
      const batch = queue.shift();
      const out = await ask(model, batch).catch(() => ({ status: 0 }));
      if (out.items) {
        failures = 0;
        for (const it of out.items) done[it.word.toLowerCase()] = it;
        // Saves take turns, so two models finishing together can't corrupt the file.
        saving = saving.then(() => fs.writeFile(cacheFile, JSON.stringify(done)));
        await saving;
        finished += batch.length;
        console.log(`  meanings ${finished} / ${todo.length}  (${model})`);
        await new Promise((r) => setTimeout(r, 6500));
      } else {
        queue.push(batch); // someone will try it again
        failures++;
        console.log(`  ${model}: ${out.status}, pausing`);
        if (failures >= 8) return console.log(`  ${model}: giving up`);
        await new Promise((r) => setTimeout(r, out.status === 429 ? 30000 : 8000));
      }
    }
  };
  await Promise.all([process.env.GEMINI_MODEL || "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"].map(worker));
  return done;
}

// ── Checking the "common mistake" notes ──────────────────────────────

// A note is only kept if it talks about a trouble spot the dictionary confirms this word really has.
const NOTE_KINDS = [
  { re: /stress|accent on/i, tags: ["stress"] },
  { re: /syllable/i, tags: ["stress", "hidden"] },
  { re: /\b[vw]\b|'[vw]'|"[vw]"/i, tags: ["vw"] },
  { re: /\bth\b|'th'|"th"/i, tags: ["th"] },
  { re: /silent|sounding the|as (it is )?(spelled|written)|pronounc\w* (the|every) ('[a-z]+'|letter)/i, tags: ["silent", "hidden", "spell"] },
  { re: /\bed\b|'ed'|-ed/i, tags: ["ed"] },
  { re: /extra ('?[ie]'?|vowel)|before the s|\bis(ch|t|p|k|m|n|l)\w+|\bes(ch|t|p|k)\w+/i, tags: ["scluster"] },
  { re: /\bz\b|'z'|\bj\b|'j'/i, tags: ["z"] },
  { re: /'a'|\bcat\b|short a/i, tags: ["ae"] },
  { re: /'o'|\boh\b|pure o|long o/i, tags: ["oh"] },
];
function groundNote(note, tags) {
  if (!note) return undefined;
  const kinds = NOTE_KINDS.filter((k) => k.re.test(note));
  if (!kinds.length) return undefined; // too vague to help
  return kinds.some((k) => k.tags.some((t) => tags.includes(t))) ? note : undefined;
}

async function checkMistakes(entries) {
  const cacheFile = path.join(CACHE, "checked.json");
  const checked = JSON.parse(await fs.readFile(cacheFile, "utf8").catch(() => "{}"));
  const todo = entries.filter((e) => e.x && !(e.w in checked));
  if (!todo.length) return checked;
  const key = await geminiKey();
  const schema = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            word: { type: "string" },
            verdict: { type: "string", enum: ["keep", "fix", "drop"] },
            note: { type: "string", description: "the corrected note when verdict is fix, otherwise empty; at most 14 simple words" },
          },
          required: ["word", "verdict", "note"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  };
  const queue = [];
  for (let i = 0; i < todo.length; i += 60) queue.push(todo.slice(i, i + 60));
  let finished = 0;
  let saving = Promise.resolve();
  const worker = async (model) => {
    let failures = 0;
    while (queue.length) {
      const batch = queue.shift();
      const list = batch.map((e) => `${e.w} | American pronunciation ${e.ipa} (${e.say}) | note: ${e.x}`).join("\n");
      const prompt = `Each line has an English word, its correct American pronunciation, and a note about how Indian English speakers commonly mispronounce it. Check each note carefully against the real pronunciation.
- keep: the note describes a real, common mistake and is correct.
- fix: the idea is useful but the wording is wrong or unclear; rewrite it correctly in at most 14 simple words.
- drop: the note is wrong, describes a sound the word doesn't have, is too vague to help, or the "mistake" is not a real common one.

${list}`;
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], response_format: { type: "json_schema", json_schema: { name: "check", schema, strict: true } } }),
      }).catch(() => null);
      if (res?.ok) {
        failures = 0;
        const items = JSON.parse((await res.json()).choices[0].message.content).items;
        for (const it of items) checked[it.word.toLowerCase()] = it.verdict === "keep" ? "keep" : it.verdict === "fix" && it.note ? it.note : "";
        saving = saving.then(() => fs.writeFile(cacheFile, JSON.stringify(checked)));
        await saving;
        finished += batch.length;
        console.log(`  checked ${finished} / ${todo.length}  (${model})`);
        await new Promise((r) => setTimeout(r, 6500));
      } else {
        queue.push(batch);
        if (++failures >= 8) return console.log(`  ${model}: giving up`);
        await new Promise((r) => setTimeout(r, res?.status === 429 ? 30000 : 8000));
      }
    }
  };
  await Promise.all(["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"].map(worker));
  return checked;
}

// ── Main ─────────────────────────────────────────────────────────────

const words = await pick();
const tagCount = {};
for (const w of words) for (const t of w.tags) tagCount[t] = (tagCount[t] ?? 0) + 1;
console.log(`picked ${words.length} words`, tagCount);

if (process.argv.includes("--pick")) {
  console.log(words.slice(0, 60).map((w) => `${w.w}(${w.tags.join(",")})`).join(" "));
  console.log("… last:", words.slice(-30).map((w) => w.w).join(" "));
  process.exit(0);
}

const info = process.argv.includes("--write-only")
  ? JSON.parse(await fs.readFile(path.join(CACHE, "enriched.json"), "utf8").catch(() => "{}"))
  : await enrich(words);
const out = [];
for (const w of words) {
  const e = info[w.w];
  if (!e || !e.keep || !e.meaning || !e.sentence) continue;
  const g = guides(w.phones);
  out.push({ w: w.w, say: g.say, ipa: g.ipa, syl: g.syl, tags: w.tags, m: e.meaning, s: e.sentence, t: e.topic, x: e.mistake || undefined, r: w.rank });
}
out.sort((a, b) => a.r - b.r);
// Keep, rewrite or remove each "common mistake" note after checking it against the real pronunciation.
const checked = process.argv.includes("--write-only")
  ? JSON.parse(await fs.readFile(path.join(CACHE, "checked.json"), "utf8").catch(() => "{}"))
  : await checkMistakes(out);
for (const e of out) if (e.x && e.w in checked) e.x = checked[e.w] === "keep" ? e.x : checked[e.w] || undefined;
for (const e of out) e.x = groundNote(e.x, e.tags);
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(out));
console.log(`wrote ${out.length} words to ${path.relative(ROOT, OUT)}`);
