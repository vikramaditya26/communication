"use client";

import { read, write } from "./store";

// Free dictionary (no key needed): instant meanings, IPA, and a real recorded pronunciation.

export type DictEntry = {
  word: string;
  phonetic?: string;
  audio?: string;
  meanings: { partOfSpeech: string; definitions: string[]; synonyms: string[] }[];
};

type ApiEntry = {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings?: { partOfSpeech: string; definitions: { definition: string }[]; synonyms?: string[] }[];
};

export async function lookupDictionary(word: string): Promise<DictEntry | null> {
  const w = word.toLowerCase();
  const key = `dict:${w}`;
  const hit = await read<DictEntry | null>(key);
  if (hit !== undefined) return hit;
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`);
    if (res.status === 404) {
      await write(key, null);
      return null;
    }
    if (!res.ok) return null;
    const data = (await res.json()) as ApiEntry[];
    const phonetics = data.flatMap((d) => d.phonetics ?? []);
    const audio =
      phonetics.find((p) => p.audio?.includes("-us."))?.audio ||
      phonetics.find((p) => p.audio)?.audio ||
      undefined;
    const entry: DictEntry = {
      word: data[0]?.word ?? w,
      phonetic: data.find((d) => d.phonetic)?.phonetic ?? phonetics.find((p) => p.text)?.text,
      audio,
      meanings: data
        .flatMap((d) => d.meanings ?? [])
        .slice(0, 3)
        .map((m) => ({
          partOfSpeech: m.partOfSpeech,
          definitions: m.definitions.slice(0, 2).map((d) => d.definition),
          synonyms: (m.synonyms ?? []).slice(0, 4),
        })),
    };
    await write(key, entry);
    return entry;
  } catch {
    return null;
  }
}
