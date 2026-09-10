import Anthropic from "@anthropic-ai/sdk";
import type { CoachErrorCode, CoachTask } from "@/lib/coach";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

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

type TaskDef = { effort: "low" | "medium"; instructions: string; schema: Record<string, unknown> };

const str = (description?: string) => ({ type: "string", ...(description && { description }) });
const int = (description: string) => ({ type: "integer", description });
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const arr = (items: Record<string, unknown>, description?: string) => ({ type: "array", items, ...(description && { description }) });

const correction = obj({ youSaid: str("the learner's exact words"), better: str("the corrected version"), why: str("one short reason") });
const betterWord = obj({ instead: str("word or phrase the learner used"), try: str("a better or more natural choice"), why: str("one short reason") });

const TASKS: Record<CoachTask, TaskDef> = {
  word: {
    effort: "low",
    instructions: "Explain this word as it is used in the sentence from the book.",
    schema: obj({
      word: str("the word in its dictionary form"),
      partOfSpeech: str(),
      ipa: str("American IPA, with slashes"),
      sayItLike: str("easy respelling, stressed syllable in CAPITALS"),
      meaning: str("simple general meaning"),
      inThisSentence: str("what it means in this exact sentence"),
      example: str("a natural everyday example sentence using the word"),
      synonyms: arr(str(), "up to 4 simpler or modern alternatives"),
      oldFashioned: { type: "boolean" },
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
      sayItNaturally: str("how someone might express this idea in a conversation today"),
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
      thinkAboutIt: str("one question the learner can answer out loud to practise speaking about this page"),
    }),
  },
  reading: {
    effort: "low",
    instructions:
      "The learner read this page aloud. Speech recognition produced `heard`. Words recognised as something else are in `misheard`; words not heard at all are in `missed`. Speech recognition is imperfect, so treat these as likely problems, not certainties. Coach the learner on the pronunciation of the most important problem words.",
    schema: obj({
      headline: str("one encouraging sentence about this attempt"),
      whatWentWell: str("one specific thing that went well"),
      focusWords: arr(
        obj({ word: str(), heardAs: str("what the recogniser heard, or empty"), sayItLike: str("respelling with stress in CAPITALS"), ipa: str(), tip: str("how to move the mouth or which sound to fix") }),
        "up to 6 words to practise, most important first",
      ),
      rhythmTip: str("one tip about pace, pausing, or stress across sentences"),
      nextStep: str("one small thing to do on the next attempt"),
    }),
  },
  retell: {
    effort: "medium",
    instructions:
      "The learner read the page, then explained it out loud in their own words. `transcript` is what they said (from speech recognition, so ignore missing punctuation). Check their understanding, correct their grammar and word choice, and show a polished version.",
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
      "The learner spoke about this topic for the given number of seconds. `transcript` comes from speech recognition, so ignore missing punctuation. Give feedback on grammar, word choice, structure (how they opened, connected ideas, and closed), and filler words.",
    schema: obj({
      overall: str("2 sentences of overall feedback"),
      scores: obj({ grammar: int("1-10"), vocabulary: int("1-10"), structure: int("1-10"), fluency: int("1-10") }),
      opening: str("feedback on how they started, with a better opening line"),
      flow: str("feedback on how they connected ideas, with useful linking phrases"),
      closing: str("feedback on how they ended, with a better closing line"),
      corrections: arr(correction, "up to 8 corrections from what they actually said"),
      betterWords: arr(betterWord, "up to 5 better word choices"),
      fillers: arr(obj({ word: str("filler word such as um, like, basically, actually"), count: int("how many times") }), "filler words used more than once"),
      polishedVersion: str("their talk rewritten as a natural, well-structured answer of similar length"),
      nextTime: str("one clear goal for their next attempt"),
    }),
  },
};

const fail = (code: CoachErrorCode, message: string, status: number) => Response.json({ error: code, message }, { status });

export async function POST(request: Request) {
  const password = process.env.APP_PASSWORD;
  if (password && request.headers.get("x-app-password") !== password) {
    return fail("locked", "This app is locked. Enter the password in Settings.", 401);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail("no_key", "Add your Claude API key (ANTHROPIC_API_KEY) to turn on the coach.", 503);
  }

  const { task, input } = (await request.json()) as { task: CoachTask; input: unknown };
  const def = TASKS[task];
  if (!def) return fail("failed", `Unknown task: ${task}`, 400);

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: def.effort, format: { type: "json_schema", schema: def.schema } },
      messages: [{ role: "user", content: `${def.instructions}\n\n<input>\n${JSON.stringify(input, null, 1)}\n</input>` }],
    });

    if (response.stop_reason === "refusal") {
      return fail("refused", "The coach couldn't answer this one. Try a different selection.", 422);
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return fail("failed", "The coach returned an empty answer.", 502);
    return Response.json({ result: JSON.parse(text.text) });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return fail("bad_key", "Your Claude API key was rejected. Check ANTHROPIC_API_KEY.", 401);
    if (error instanceof Anthropic.RateLimitError) return fail("rate_limited", "Too many requests. Wait a moment and try again.", 429);
    if (error instanceof Anthropic.APIError) return fail("failed", `Claude API error ${error.status}: ${error.message}`, 502);
    return fail("failed", error instanceof Error ? error.message : "Something went wrong.", 500);
  }
}
