import Anthropic from "@anthropic-ai/sdk";
import type { CoachErrorCode, CoachTask } from "@/lib/coach";

// Free models can take a while to answer.
export const maxDuration = 60;

const SYSTEM = `You are Vaani, a warm and precise English communication coach inside a reading app.

The learner speaks Indian English at an intermediate level. They can hold a conversation, but people tell them they make many pronunciation and grammar mistakes. They want clear, natural American English pronunciation, correct grammar, and better word choice.

How to coach:
- Write in simple, plain English (about B1 level). Short sentences. No jargon unless you explain it.
- Be concrete. Name the exact word, sound, or grammar rule. Never give vague advice like "practise more".
- Be kind and encouraging, but honest about mistakes.
- For pronunciation, give an easy respelling with the stressed syllable in CAPITALS (for example "pro-NUN-see-AY-shun") plus American IPA.
- Where it helps, mention common Indian-English patterns: V and W sounding the same, "th" said as T or D, stress on the wrong syllable, full vowels where Americans use a weak "uh" (schwa), dropping or adding articles (a/the), and present-continuous overuse ("I am having").
- These books are often old. When a word or phrase is old-fashioned (thou, hath, 'tis, ere), say so and give the modern equivalent.
- Keep every answer short enough to read comfortably on a phone.`;

type Schema = { type: string; description?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema };
type TaskDef = { effort: "low" | "medium"; instructions: string; schema: Schema };

const str = (description?: string): Schema => ({ type: "string", ...(description && { description }) });
const int = (description: string): Schema => ({ type: "integer", description });
const bool = (): Schema => ({ type: "boolean" });
const obj = (properties: Record<string, Schema>): Schema => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const arr = (items: Schema, description?: string): Schema => ({ type: "array", items, ...(description && { description }) });

const correction = obj({ youSaid: str("the learner's exact words"), better: str("the corrected version"), why: str("one short reason") });
const betterWord = obj({ instead: str("word or phrase the learner used"), try: str("a better or more natural choice"), why: str("one short reason") });

const TASKS: Record<CoachTask, TaskDef> = {
  chat: {
    effort: "low",
    instructions: `This is a spoken conversation practice. Play the character described in \`persona\`. The learner's latest words are in \`message\` (from speech recognition, so ignore missing punctuation); earlier turns are in \`history\`.
Two jobs:
1. reply: answer as the character, in their voice and with their ideas, but in simple modern spoken English (about B1) so the learner can follow. 1 to 3 short sentences. Usually end with a question so the conversation keeps going. Never correct the learner inside the reply.
2. correction: look only at the learner's latest message. If it has a real grammar or word-choice mistake, set needed to true and give the most useful single fix. Ignore punctuation, capital letters and small speech-recognition slips. If it is fine, set needed to false and leave the other fields empty.
Also pick one useful word or phrase from your reply that the learner might not know (newWord), or leave it empty.`,
    schema: obj({
      reply: str("the character's spoken reply"),
      correction: obj({ needed: bool(), youSaid: str("the learner's words with the mistake"), better: str("corrected version"), why: str("one short reason") }),
      newWord: obj({ word: str(), meaning: str("simple meaning") }),
    }),
  },
  word: {
    effort: "low",
    instructions: "Explain this word as it is used in the sentence from the book.",
    schema: obj({
      word: str("the word in its dictionary form"),
      partOfSpeech: str(),
      ipa: str("American IPA, with slashes"),
      sayItLike: str("easy respelling, stressed syllable in capitals"),
      meaning: str("simple general meaning"),
      inThisSentence: str("what it means in this exact sentence"),
      example: str("a natural everyday example sentence using the word"),
      synonyms: arr(str(), "up to 4 simpler or modern alternatives"),
      oldFashioned: bool(),
      modernWord: str("modern equivalent if old-fashioned, otherwise empty"),
      soundTip: str("one pronunciation tip for this word, focusing on sounds Indian-English speakers often find tricky; empty if none"),
    }),
  },
  text: {
    effort: "low",
    instructions: "The learner selected this text from the book. Explain what it means and the grammar that makes it work.",
    schema: obj({
      plainEnglish: str("the same idea rewritten in simple modern English"),
      meaning: str("what the author is saying, in 1-2 sentences"),
      grammar: arr(obj({ title: str("name of the grammar point"), explanation: str("short explanation using the text as the example") }), "1 to 3 grammar points worth learning"),
      words: arr(obj({ word: str(), meaning: str() }), "up to 4 difficult words"),
      sayItNaturally: str("how someone might say this idea in a conversation today"),
    }),
  },
  page: {
    effort: "medium",
    instructions: "Help the learner understand this page of the book.",
    schema: obj({
      summary: str("2-3 sentence summary of the page"),
      explainSimply: str("a short, simple explanation of the page, as if talking to a friend"),
      keyIdeas: arr(str(), "up to 3 key ideas"),
      wordsToLearn: arr(obj({ word: str(), meaning: str() }), "up to 5 useful words from the page"),
      thinkAboutIt: str("one question the learner can answer out loud to practice speaking about this page"),
    }),
  },
  reading: {
    effort: "low",
    instructions:
      "The learner read this page out loud. Speech recognition produced `heard`. Words recognized as something else are in `misheard`; words not heard at all are in `missed`. Speech recognition makes mistakes too, so treat these as likely problems, not certainties. Help the learner with the pronunciation of the most important problem words.",
    schema: obj({
      headline: str("one plain sentence summing up this attempt"),
      whatWentWell: str("one specific thing that went well"),
      focusWords: arr(
        obj({ word: str(), heardAs: str("what the recognizer heard, or empty"), sayItLike: str("respelling with stress in capitals"), ipa: str(), tip: str("how to move the mouth or which sound to fix") }),
        "up to 6 words to practice, most important first",
      ),
      rhythmTip: str("one tip about pace, pausing, or stress across sentences"),
      nextStep: str("one small thing to do on the next attempt"),
    }),
  },
  retell: {
    effort: "medium",
    instructions:
      "The learner read the page, then explained it out loud in their own words. `transcript` is what they said (from speech recognition, so ignore missing punctuation). Check their understanding, correct their grammar and word choice, and show a better version.",
    schema: obj({
      understandingScore: int("1 to 5, how well they understood the page"),
      understanding: str("short comment on their understanding"),
      corrections: arr(correction, "up to 6 grammar or phrasing corrections from what they actually said"),
      betterWords: arr(betterWord, "up to 4 more natural or precise word choices"),
      polishedVersion: str("their explanation rewritten in natural, correct spoken English, keeping their ideas"),
      tip: str("one speaking tip for next time"),
    }),
  },
  topic: {
    effort: "medium",
    instructions:
      "The learner spoke about this topic for the given number of seconds. `transcript` comes from speech recognition, so ignore missing punctuation. Give feedback on grammar, word choice, structure (how they started, connected ideas, and finished), and filler words.",
    schema: obj({
      overall: str("2 sentences of overall feedback"),
      scores: obj({ grammar: int("1-10"), vocabulary: int("1-10"), structure: int("1-10"), fluency: int("1-10") }),
      opening: str("feedback on how they started, with a better opening line"),
      flow: str("feedback on how they connected ideas, with useful linking phrases"),
      closing: str("feedback on how they finished, with a better closing line"),
      corrections: arr(correction, "up to 8 corrections from what they actually said"),
      betterWords: arr(betterWord, "up to 5 better word choices"),
      fillers: arr(obj({ word: str("filler word such as um, like, basically, actually"), count: int("how many times") }), "filler words used more than once"),
      polishedVersion: str("their talk rewritten as a natural, well-structured answer of similar length"),
      nextTime: str("one clear goal for their next attempt"),
    }),
  },
};

class ProviderError extends Error {
  constructor(
    public code: CoachErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Makes sure the answer has every field the app expects, even if a model skips one. */
function coerce(schema: Schema, value: unknown): unknown {
  switch (schema.type) {
    case "object": {
      const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
      return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([k, s]) => [k, coerce(s, source[k])]));
    }
    case "array":
      return Array.isArray(value) && schema.items ? value.map((v) => coerce(schema.items!, v)) : [];
    case "integer":
    case "number": {
      const n = Number(value);
      return Number.isFinite(n) ? (schema.type === "integer" ? Math.round(n) : n) : 0;
    }
    case "boolean":
      return value === true || value === "true";
    default:
      return typeof value === "string" ? value : value == null ? "" : String(value);
  }
}

const safeJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Models sometimes wrap JSON in ```json fences or add a sentence around it. */
function parseLoose(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  const direct = safeJson(cleaned);
  if (direct) return direct;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return start >= 0 && end > start ? safeJson(cleaned.slice(start, end + 1)) : null;
}

function errorDetail(raw: string) {
  const body = safeJson(raw) as { error?: { message?: unknown } } | { error?: { message?: unknown } }[] | null;
  const message = (Array.isArray(body) ? body[0]?.error?.message : body?.error?.message) ?? raw.slice(0, 200);
  return String(message || "unknown error");
}

// ── Claude (paid) ────────────────────────────────────────────────────

async function askClaude(def: TaskDef, content: string): Promise<unknown> {
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
      max_tokens: 16000,
      system: SYSTEM,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: def.effort, format: { type: "json_schema", schema: def.schema } },
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") throw new ProviderError("refused", "Claude couldn’t answer this one. Try a different selection.");
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new ProviderError("failed", "Claude sent back an empty answer.");
    return JSON.parse(text.text);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Anthropic.AuthenticationError) throw new ProviderError("bad_key", "Claude didn’t accept your key. Check ANTHROPIC_API_KEY, then redeploy.");
    if (error instanceof Anthropic.RateLimitError) throw new ProviderError("rate_limited", "Claude is busy right now. Wait a moment and try again.");
    if (error instanceof Anthropic.APIError) throw new ProviderError("failed", `Claude error ${error.status}: ${error.message}`);
    throw new ProviderError("failed", error instanceof Error ? error.message : "Something went wrong.");
  }
}

// ── OpenAI-compatible services (Gemini, Groq, OpenRouter, …) ─────────

type Compatible = { name: string; keyVar: string; key: string; baseURL: string; models: string[]; strictSchema: boolean };

async function askCompatible(p: Compatible, task: CoachTask, def: TaskDef, content: string): Promise<unknown> {
  let last: ProviderError | null = null;

  for (const model of p.models) {
    // Try strict JSON schema first; if the service rejects it, fall back to plain JSON mode.
    for (const strict of p.strictSchema ? [true, false] : [false]) {
      const body = {
        model,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `${content}\n\nReply with only a JSON object that matches this JSON Schema:\n${JSON.stringify(def.schema)}` },
        ],
        response_format: strict ? { type: "json_schema", json_schema: { name: task, schema: def.schema, strict: true } } : { type: "json_object" },
        ...(model.startsWith("openai/gpt-oss") && { reasoning_effort: "low" }),
      };

      let res: Response;
      try {
        res = await fetch(`${p.baseURL}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(50_000),
        });
      } catch {
        last = new ProviderError("failed", `${p.name} didn’t respond in time. Try again.`);
        break;
      }

      const raw = await res.text();
      if (res.ok) {
        const reply = (safeJson(raw) as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
        const parsed = typeof reply === "string" ? parseLoose(reply) : null;
        if (parsed) return parsed;
        last = new ProviderError("failed", `${p.name} sent an answer the app couldn’t read. Try again.`);
        continue;
      }

      const detail = errorDetail(raw);
      if (res.status === 401 || res.status === 403 || /api key/i.test(detail)) {
        throw new ProviderError("bad_key", `${p.name} didn’t accept your key. Check ${p.keyVar} in Vercel (or .env.local), then redeploy.`);
      }
      if (res.status === 429) {
        last = new ProviderError("rate_limited", `You’ve used up the free ${p.name} limit for now. Wait a minute and try again.`);
        break;
      }
      if (res.status === 400 && strict) {
        last = new ProviderError("failed", `${p.name}: ${detail}`);
        continue;
      }
      // Unknown model, server error, etc.: try the next model.
      last = new ProviderError("failed", `${p.name} error ${res.status}: ${detail}`);
      break;
    }
  }
  throw last ?? new ProviderError("failed", `${p.name} couldn’t answer.`);
}

type Provider = { name: string; ask: (task: CoachTask, def: TaskDef, content: string) => Promise<unknown> };

function providers(): Provider[] {
  const env = process.env;
  const list: Provider[] = [];
  const compatible = (p: Compatible): Provider => ({ name: p.name, ask: (task, def, content) => askCompatible(p, task, def, content) });

  if (env.ANTHROPIC_API_KEY) list.push({ name: "Claude", ask: (_task, def, content) => askClaude(def, content) });
  if (env.GEMINI_API_KEY) {
    list.push(
      compatible({
        name: "Gemini",
        keyVar: "GEMINI_API_KEY",
        key: env.GEMINI_API_KEY,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
        models: [...new Set([env.GEMINI_MODEL || "gemini-3.8-flash", "gemini-3.5-flash-lite"])],
        strictSchema: true,
      }),
    );
  }
  if (env.GROQ_API_KEY) {
    list.push(
      compatible({
        name: "Groq",
        keyVar: "GROQ_API_KEY",
        key: env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
        models: [env.GROQ_MODEL || "openai/gpt-oss-120b"],
        strictSchema: true,
      }),
    );
  }
  if (env.AI_BASE_URL && env.AI_API_KEY && env.AI_MODEL) {
    list.push(
      compatible({
        name: "Your AI service",
        keyVar: "AI_API_KEY",
        key: env.AI_API_KEY,
        baseURL: env.AI_BASE_URL.replace(/\/+$/, ""),
        models: [env.AI_MODEL],
        strictSchema: false,
      }),
    );
  }
  return list;
}

const STATUS: Record<CoachErrorCode, number> = { no_key: 503, bad_key: 401, rate_limited: 429, refused: 422, locked: 401, failed: 502 };
const fail = (code: CoachErrorCode, message: string) => Response.json({ error: code, message }, { status: STATUS[code] });

export async function POST(request: Request) {
  const password = process.env.APP_PASSWORD;
  if (password && request.headers.get("x-app-password") !== password) {
    return fail("locked", "This app is locked. Enter the app password.");
  }

  const available = providers();
  if (!available.length) {
    return fail("no_key", "No AI key is set up. Add GEMINI_API_KEY (free from Google AI Studio) in Vercel, then redeploy.");
  }

  const { task, input } = (await request.json()) as { task: CoachTask; input: unknown };
  const def = TASKS[task];
  if (!def) return fail("failed", `Unknown task: ${task}`);

  const content = `${def.instructions}\n\n<input>\n${JSON.stringify(input, null, 1)}\n</input>`;
  const errors: ProviderError[] = [];

  // If one service is out of free requests (or down), try the next one that has a key.
  for (const provider of available) {
    try {
      const answer = await provider.ask(task, def, content);
      return Response.json({ result: coerce(def.schema, answer), provider: provider.name });
    } catch (error) {
      errors.push(error instanceof ProviderError ? error : new ProviderError("failed", error instanceof Error ? error.message : String(error)));
    }
  }

  const worst = errors.find((e) => e.code === "bad_key") ?? errors[0];
  return fail(worst.code, worst.message);
}
