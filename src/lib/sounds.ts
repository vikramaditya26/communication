// Sound pairs that Indian English speakers often mix up when aiming for American English.

export type Contrast = {
  id: string;
  a: string; // label for the first sound
  b: string; // label for the second sound
  title: string;
  why: string;
  tipA: string;
  tipB: string;
  pairs: [string, string][];
};

export const CONTRASTS: Contrast[] = [
  {
    id: "v-w",
    a: "V",
    b: "W",
    title: "V and W",
    why: "In many Indian languages one sound covers both, so “vest” and “west” can sound the same.",
    tipA: "V: rest your top teeth lightly on your bottom lip and let your voice buzz. You should feel a tickle on your lip.",
    tipB: "W: round your lips like you are saying “oo”, then open them. Your teeth never touch your lip.",
    pairs: [
      ["vine", "wine"],
      ["vest", "west"],
      ["vet", "wet"],
      ["veil", "whale"],
      ["verse", "worse"],
      ["vent", "went"],
      ["vile", "while"],
      ["viper", "wiper"],
    ],
  },
  {
    id: "th-t",
    a: "TH",
    b: "T",
    title: "TH (three) and T",
    why: "“Th” is often said as a hard T, so “three” sounds like “tree”.",
    tipA: "TH: put the tip of your tongue between your teeth and blow air out gently. No voice, just air.",
    tipB: "T: tap your tongue on the ridge just behind your top teeth, then release.",
    pairs: [
      ["three", "tree"],
      ["thin", "tin"],
      ["thank", "tank"],
      ["thought", "taught"],
      ["bath", "bat"],
      ["path", "pat"],
      ["both", "boat"],
      ["thigh", "tie"],
    ],
  },
  {
    id: "th-d",
    a: "TH",
    b: "D",
    title: "TH (they) and D",
    why: "The voiced “th” in “they” and “this” is often said as D, so “they” sounds like “day”.",
    tipA: "TH: tongue tip between your teeth, like the TH in “three”, but turn your voice on so it buzzes.",
    tipB: "D: tap your tongue behind your top teeth, with your voice on.",
    pairs: [
      ["they", "day"],
      ["then", "den"],
      ["though", "dough"],
      ["breathe", "breed"],
      ["those", "doze"],
      ["there", "dare"],
      ["worthy", "wordy"],
      ["lather", "ladder"],
    ],
  },
  {
    id: "ee-i",
    a: "EE",
    b: "I",
    title: "EE (sheep) and I (ship)",
    why: "Long and short vowels often end up the same length, so “leave” and “live” sound alike.",
    tipA: "EE: smile wide, tongue high, and hold the sound a little longer.",
    tipB: "I: relax your mouth, drop your tongue a little, and keep it short.",
    pairs: [
      ["sheep", "ship"],
      ["leave", "live"],
      ["feel", "fill"],
      ["seat", "sit"],
      ["heat", "hit"],
      ["beat", "bit"],
      ["peak", "pick"],
      ["deed", "did"],
    ],
  },
  {
    id: "a-e",
    a: "A",
    b: "E",
    title: "A (cat) and E (bed)",
    why: "The American “a” in “cat” is wide open. If the jaw doesn’t drop, “bad” sounds like “bed”.",
    tipA: "A (cat): drop your jaw wide open and pull the corners of your lips back, almost like a smile.",
    tipB: "E (bed): open your mouth only halfway. It’s a shorter, more relaxed sound.",
    pairs: [
      ["bad", "bed"],
      ["man", "men"],
      ["sat", "set"],
      ["pan", "pen"],
      ["had", "head"],
      ["bag", "beg"],
      ["band", "bend"],
      ["tan", "ten"],
    ],
  },
  {
    id: "s-sh",
    a: "S",
    b: "SH",
    title: "S and SH",
    why: "These can swap in fast speech, so “see” and “she” get mixed up.",
    tipA: "S: smile a little, tongue close behind your top teeth, and hiss like a snake.",
    tipB: "SH: push your lips forward into a round shape and pull your tongue back, like telling someone to be quiet.",
    pairs: [
      ["see", "she"],
      ["sip", "ship"],
      ["sort", "short"],
      ["save", "shave"],
      ["sell", "shell"],
      ["seat", "sheet"],
      ["sock", "shock"],
      ["mass", "mash"],
    ],
  },
  {
    id: "o-oh",
    a: "O",
    b: "OH",
    title: "O (not) and OH (note)",
    why: "In American English the “o” in “note” slides into a small “oo” at the end. Without it, “note” sounds like “not”.",
    tipA: "O (not): open your mouth wide and relaxed, like at the doctor saying “ahh”.",
    tipB: "OH (note): start with rounded lips and finish by closing them a little more, “oh-oo”.",
    pairs: [
      ["not", "note"],
      ["cot", "coat"],
      ["rod", "road"],
      ["hop", "hope"],
      ["cost", "coast"],
      ["got", "goat"],
      ["sock", "soak"],
      ["rob", "robe"],
    ],
  },
];

export type DrillStats = {
  listen: { right: number; total: number };
  say: { right: number; total: number };
  words: Record<string, { right: number; wrong: number }>;
  last: number;
};

export const drillKey = (id: string) => `drill:${id}`;
export const emptyStats = (): DrillStats => ({ listen: { right: 0, total: 0 }, say: { right: 0, total: 0 }, words: {}, last: 0 });
export const pct = (s: { right: number; total: number }) => (s.total ? Math.round((s.right / s.total) * 100) : null);
