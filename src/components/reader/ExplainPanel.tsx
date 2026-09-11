"use client";

import { Bookmark, MessageSquareText, Quote, Sparkles, X } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { useCoach } from "@/lib/coach-client";
import { saveItem, savedId, savedKey, useStored, useStoredList, type SavedItem } from "@/lib/store";
import type { LibraryBook } from "@/lib/types";
import { CoachNotice, SaveToggle, SectionLabel, SpeakButton } from "../coach/Feedback";
import { Button, IconButton, Skeleton } from "../ui";

type Props = {
  book: LibraryBook;
  page: number;
  pageText: string;
  selection: { text: string } | null;
  onClearSelection: () => void;
  onRetell: () => void;
};

export function ExplainPanel({ book, page, pageText, selection, onClearSelection, onRetell }: Props) {
  return (
    <div className="space-y-6 p-5">
      {selection && <SelectionHelp book={book} page={page} text={selection.text} context={pageText} onClear={onClearSelection} />}
      <PageHelpSection book={book} page={page} pageText={pageText} onRetell={onRetell} />
    </div>
  );
}

function SelectionHelp({ book, page, text, context, onClear }: { book: LibraryBook; page: number; text: string; context: string; onClear: () => void }) {
  const input = useMemo(() => ({ text, context: context.slice(0, 2500), book: `${book.title} by ${book.author}` }), [text, context, book]);
  const { data, error, loading, run } = useCoach("text", input, { auto: true });
  const [saved] = useStored<SavedItem>(savedKey(savedId("phrase", text)));

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-line bg-card p-4">
      <div className="flex items-start gap-2">
        <Quote size={16} className="mt-1 shrink-0 text-accent" />
        <div className="line-clamp-4 min-w-0 flex-1 font-reading text-[15px] italic leading-relaxed text-ink-2">{text}</div>
        <IconButton label="Close" onClick={onClear} className="-mr-2 -mt-2 h-8 w-8">
          <X size={16} />
        </IconButton>
      </div>

      {loading && (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      )}
      {error && (
        <div className="mt-4">
          <CoachNotice error={error} onRetry={() => run()} />
        </div>
      )}
      {data && (
        <div className="mt-4 space-y-4 text-[15px] leading-relaxed">
          <div>
            <SectionLabel>In simple English</SectionLabel>
            <div className="font-reading text-[17px]">{data.plainEnglish}</div>
            <div className="mt-2">
              <SpeakButton text={data.plainEnglish} variant="ghost" />
            </div>
          </div>
          <div>
            <SectionLabel>What it means</SectionLabel>
            <div className="text-ink-2">{data.meaning}</div>
          </div>
          {data.grammar.length > 0 && (
            <div>
              <SectionLabel>Grammar</SectionLabel>
              <ol className="space-y-2.5">
                {data.grammar.map((g, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{i + 1}</span>
                    <div>
                      <div className="font-medium">{g.title}</div>
                      <div className="text-sm text-ink-2">{g.explanation}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {data.words.length > 0 && (
            <div>
              <SectionLabel>Words</SectionLabel>
              <ul className="space-y-1.5">
                {data.words.map((w) => (
                  <li key={w.word} className="text-sm">
                    <b>{w.word}</b> <span className="text-ink-2">· {w.meaning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-2xl bg-paper-2 p-3.5">
            <SectionLabel>Say it naturally</SectionLabel>
            <div className="font-medium">“{data.sayItNaturally}”</div>
            <div className="mt-2">
              <SpeakButton text={data.sayItNaturally} label="Hear it" variant="ghost" />
            </div>
          </div>
          <SaveToggle
            saved={Boolean(saved)}
            label="Save phrase"
            onSave={() => saveItem({ kind: "phrase", text: text.slice(0, 300), note: data.plainEnglish, detail: { natural: data.sayItNaturally }, slug: book.slug, page })}
          />
        </div>
      )}
    </motion.section>
  );
}

function PageHelpSection({ book, page, pageText, onRetell }: { book: LibraryBook; page: number; pageText: string; onRetell: () => void }) {
  const input = useMemo(() => (pageText ? { text: pageText, book: book.title, author: book.author } : null), [pageText, book]);
  const { data, error, loading, run } = useCoach("page", input, { auto: "cache" });
  const [savedList] = useStoredList<SavedItem>("saved:word-");
  const savedWords = useMemo(() => new Set(savedList.map((s) => s.text.toLowerCase())), [savedList]);

  if (!data && !loading && !error) {
    return (
      <section className="rounded-3xl bg-gradient-to-br from-accent-soft via-accent-soft/40 to-transparent p-5">
        <Sparkles className="text-accent" size={22} />
        <div className="mt-3 font-display text-2xl leading-tight">Explain this page</div>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">Get a short summary, with the hard words explained in simple English.</p>
        <Button className="mt-4" icon={<Sparkles size={16} />} onClick={() => run()} disabled={!input}>
          Explain
        </Button>
        <p className="mt-4 text-xs leading-relaxed text-ink-3">You can also tap one word, or select a sentence to have it explained.</p>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={16} className="text-accent" />
        <div className="font-display text-xl">This page</div>
      </div>
      {loading && (
        <div className="space-y-2">
          <div className="mb-3 text-sm text-ink-3">Reading the page…</div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="mt-4 h-20 w-full" />
        </div>
      )}
      {error && <CoachNotice error={error} onRetry={() => run()} />}
      {data && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 text-[15px] leading-relaxed">
          <div>
            <SectionLabel>Summary</SectionLabel>
            <div className="font-reading text-[17px] leading-relaxed">{data.summary}</div>
          </div>
          <div>
            <SectionLabel>In simple words</SectionLabel>
            <div className="text-ink-2">{data.explainSimply}</div>
            <div className="mt-2">
              <SpeakButton text={data.explainSimply} variant="ghost" />
            </div>
          </div>
          {data.keyIdeas.length > 0 && (
            <div>
              <SectionLabel>Key ideas</SectionLabel>
              <ul className="space-y-1.5">
                {data.keyIdeas.map((k, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    {k}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.wordsToLearn.length > 0 && (
            <div>
              <SectionLabel>Words to learn</SectionLabel>
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {data.wordsToLearn.map((w) => {
                  const isSaved = savedWords.has(w.word.toLowerCase());
                  return (
                    <li key={w.word} className="flex items-center gap-3 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1 text-sm">
                        <b className="text-[15px]">{w.word}</b>
                        <div className="text-ink-2">{w.meaning}</div>
                      </div>
                      <IconButton
                        label={isSaved ? "Saved" : "Save word"}
                        active={isSaved}
                        onClick={() => !isSaved && saveItem({ kind: "word", text: w.word, note: w.meaning, slug: book.slug, page })}
                        className="h-9 w-9"
                      >
                        <Bookmark size={16} fill={isSaved ? "currentColor" : "none"} />
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="rounded-3xl bg-ink p-4 text-paper">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-60">Try answering out loud</div>
            <div className="mt-1.5 font-reading text-[17px] leading-snug">{data.thinkAboutIt}</div>
            <button onClick={onRetell} className="mt-3 inline-flex h-9 items-center gap-2 rounded-full bg-paper px-4 text-sm font-medium text-ink active:scale-95">
              <MessageSquareText size={15} /> Answer
            </button>
          </div>
        </motion.div>
      )}
    </section>
  );
}
