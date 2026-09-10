"use client";

import clsx from "clsx";
import { memo, type MouseEvent } from "react";
import type { WordMark } from "@/lib/speech";
import type { Page } from "@/lib/types";

export type Token = { i: number; text: string; clean: string; heading: boolean; sentence: string };
type Segment = string | number; // spacing text, or a token index
type RenderBlock = { kind: "h" | "p" | "v"; level: number; lines: Segment[][] };
export type PageModel = { tokens: Token[]; blocks: RenderBlock[] };

export const cleanWord = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const SENTENCE_END = /[.!?]["”’)\]]*$/;

/** Splits a page into tappable words, remembering which sentence each word belongs to. */
export function buildPageModel(page: Page): PageModel {
  const tokens: Token[] = [];
  const blocks: RenderBlock[] = [];
  for (const b of page) {
    const kind = "h" in b ? "h" : "v" in b ? "v" : "p";
    const lines = "h" in b ? [b.h] : "p" in b ? [b.p] : b.v;
    const ids: number[] = [];
    const rendered = lines.map((line) => {
      const segs: Segment[] = [];
      let last = 0;
      for (const m of line.matchAll(/[^\s—–]+/g)) {
        const at = m.index ?? 0;
        if (at > last) segs.push(line.slice(last, at));
        const i = tokens.length;
        tokens.push({ i, text: m[0], clean: cleanWord(m[0]), heading: kind === "h", sentence: "" });
        ids.push(i);
        segs.push(i);
        last = at + m[0].length;
      }
      if (last < line.length) segs.push(line.slice(last));
      return segs;
    });
    let start = 0;
    ids.forEach((id, k) => {
      if (SENTENCE_END.test(tokens[id].text) || k === ids.length - 1) {
        const group = ids.slice(start, k + 1);
        const sentence = group.map((g) => tokens[g].text).join(" ");
        group.forEach((g) => (tokens[g].sentence = sentence));
        start = k + 1;
      }
    });
    blocks.push({ kind, level: "h" in b ? b.l : 0, lines: rendered });
  }
  return { tokens, blocks };
}

type Props = {
  model: PageModel;
  marks: WordMark[] | null;
  activeIndex: number | null;
  speaking: { from: number; to: number; word: number | null } | null;
  savedWords: Set<string>;
  onWord: (index: number, rect: DOMRect) => void;
};

export const PageText = memo(function PageText({ model, marks, activeIndex, speaking, savedWords, onWord }: Props) {
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
    if (!el) return;
    onWord(Number(el.dataset.i), el.getBoundingClientRect());
  };

  const word = (i: number) => {
    const t = model.tokens[i];
    const m = marks?.[i];
    const mark = m && !(m.mark === "skip" && m.heard === "__unread") && !t.heading && t.clean ? m.mark : undefined;
    const spk = speaking && i >= speaking.from && i <= speaking.to ? (speaking.word === i ? "word" : "line") : undefined;
    return (
      <span
        key={i}
        className="word"
        data-i={i}
        data-mark={mark}
        data-active={activeIndex === i || undefined}
        data-speaking={spk}
        data-saved={savedWords.has(t.clean.toLowerCase()) || undefined}
      >
        {t.text}
      </span>
    );
  };

  const line = (segs: Segment[]) => segs.map((s, k) => (typeof s === "number" ? word(s) : <span key={`s${k}`}>{s}</span>));

  return (
    <div onClick={handleClick} className="select-text">
      {model.blocks.map((b, bi) => {
        if (b.kind === "h") {
          const big = b.level <= 2;
          return (
            <h2
              key={bi}
              className={clsx(
                "font-display text-balance text-center tracking-tight",
                big ? "mb-8 mt-4 text-[1.55em] leading-tight" : b.level === 3 ? "mb-6 mt-4 text-[1.3em] leading-snug" : "mb-5 mt-3 text-[1.12em] font-medium",
              )}
            >
              {line(b.lines[0])}
            </h2>
          );
        }
        if (b.kind === "v") {
          return (
            <div key={bi} className="my-[1.1em] border-l-2 border-accent/25 pl-[0.9em]">
              {b.lines.map((segs, li) => (
                <div key={li} className="pl-[1.2em] -indent-[1.2em] leading-[1.7]">
                  {line(segs)}
                </div>
              ))}
            </div>
          );
        }
        return (
          <p key={bi} className="mb-[0.95em] text-pretty">
            {line(b.lines[0])}
          </p>
        );
      })}
    </div>
  );
});
