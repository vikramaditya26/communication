// Shapes of what the AI coach sends back, shared by the API route and the UI.

export type WordHelp = {
  word: string;
  partOfSpeech: string;
  ipa: string;
  sayItLike: string;
  meaning: string;
  inThisSentence: string;
  example: string;
  synonyms: string[];
  oldFashioned: boolean;
  modernWord: string;
  soundTip: string;
};

export type TextHelp = {
  plainEnglish: string;
  meaning: string;
  grammar: { title: string; explanation: string }[];
  words: { word: string; meaning: string }[];
  sayItNaturally: string;
};

export type PageHelp = {
  summary: string;
  explainSimply: string;
  keyIdeas: string[];
  wordsToLearn: { word: string; meaning: string }[];
  thinkAboutIt: string;
};

export type ReadingFeedback = {
  headline: string;
  whatWentWell: string;
  focusWords: { word: string; heardAs: string; sayItLike: string; ipa: string; tip: string }[];
  rhythmTip: string;
  nextStep: string;
};

export type Correction = { youSaid: string; better: string; why: string };
export type BetterWord = { instead: string; try: string; why: string };

export type RetellFeedback = {
  understandingScore: number;
  understanding: string;
  corrections: Correction[];
  betterWords: BetterWord[];
  polishedVersion: string;
  tip: string;
};

export type TopicFeedback = {
  overall: string;
  scores: { grammar: number; vocabulary: number; structure: number; fluency: number };
  opening: string;
  flow: string;
  closing: string;
  corrections: Correction[];
  betterWords: BetterWord[];
  fillers: { word: string; count: number }[];
  polishedVersion: string;
  nextTime: string;
};

export type CoachTasks = {
  word: { input: { word: string; sentence: string; book: string }; output: WordHelp };
  text: { input: { text: string; context: string; book: string }; output: TextHelp };
  page: { input: { text: string; book: string; author: string }; output: PageHelp };
  reading: {
    input: { text: string; heard: string; accuracy: number; wpm: number; misheard: { expected: string; heard: string }[]; missed: string[] };
    output: ReadingFeedback;
  };
  retell: { input: { text: string; transcript: string; book: string }; output: RetellFeedback };
  topic: { input: { topic: string; transcript: string; seconds: number }; output: TopicFeedback };
};

export type CoachTask = keyof CoachTasks;

export type CoachErrorCode = "no_key" | "bad_key" | "rate_limited" | "refused" | "locked" | "failed";
