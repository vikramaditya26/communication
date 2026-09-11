"use client";

import clsx from "clsx";
import { Minus, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReaderSettings, ReaderTheme } from "@/lib/readerSettings";
import { loadVoices, speak } from "@/lib/speech";
import type { BookIndex } from "@/lib/types";
import { SectionLabel } from "../coach/Feedback";
import { Button, Sheet } from "../ui";

export function TocSheet({ open, onClose, index, current, onGo }: { open: boolean; onClose: () => void; index: BookIndex | null; current: number; onGo: (page: number) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Contents">
      <TocBody onClose={onClose} index={index} current={current} onGo={onGo} />
    </Sheet>
  );
}

function TocBody({ onClose, index, current, onGo }: { onClose: () => void; index: BookIndex | null; current: number; onGo: (page: number) => void }) {
  const [filter, setFilter] = useState("");
  const [goto, setGoto] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const toc = useMemo(() => index?.toc ?? [], [index]);
  const minLevel = toc.reduce((m, e) => Math.min(m, e.l), 9);
  const currentEntry = toc.reduce((best, e, i) => (e.p <= current ? i : best), -1);
  const shown = filter ? toc.map((e, i) => ({ e, i })).filter(({ e }) => e.t.toLowerCase().includes(filter.toLowerCase())) : toc.map((e, i) => ({ e, i }));

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.querySelector("[data-current]")?.scrollIntoView({ block: "center" }), 250);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <div className="px-5 pb-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(goto);
            if (index && n >= 1 && n <= index.pages) {
              onGo(n - 1);
              onClose();
            }
          }}
        >
          <input
            value={goto}
            onChange={(e) => setGoto(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder={`Go to page (1–${index?.pages ?? ""})`}
            className="h-10 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-sm outline-none focus:border-accent"
          />
          <Button type="submit" variant="outline">
            Go
          </Button>
        </form>
        {toc.length > 25 && (
          <label className="relative mt-2 flex items-center">
            <Search size={15} className="absolute left-3.5 text-ink-3" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a chapter" className="h-10 w-full rounded-full border border-line bg-paper pl-10 pr-4 text-sm outline-none focus:border-accent" />
          </label>
        )}
      </div>
      <div ref={listRef} className="px-3 pb-6">
        {shown.map(({ e, i }) => (
          <button
            key={i}
            data-current={i === currentEntry || undefined}
            onClick={() => {
              onGo(e.p);
              onClose();
            }}
            className={clsx(
              "flex w-full items-baseline justify-between gap-4 rounded-xl py-2.5 pr-3 text-left text-[15px] transition hover:bg-ink/5",
              i === currentEntry && "bg-accent-soft text-accent",
              e.l === minLevel && "font-medium",
            )}
            style={{ paddingLeft: `${0.75 + (filter ? 0 : Math.min(3, e.l - minLevel))}rem` }}
          >
            <span className="min-w-0">{e.t}</span>
            <span className="shrink-0 text-xs tabular-nums text-ink-3">{e.p + 1}</span>
          </button>
        ))}
        {!toc.length && <div className="p-4 text-sm text-ink-3">No chapters in this book.</div>}
      </div>
    </>
  );
}

const THEMES: { id: ReaderTheme; label: string; bg: string; fg: string }[] = [
  { id: "paper", label: "Paper", bg: "#fffdf9", fg: "#1e1a15" },
  { id: "sepia", label: "Sepia", bg: "#f3e9d4", fg: "#3b2e20" },
  { id: "night", label: "Night", bg: "#0e0d0c", fg: "#d9d0c3" },
];

export function SettingsSheet({ open, onClose, settings, update }: { open: boolean; onClose: () => void; settings: ReaderSettings; update: (p: Partial<ReaderSettings>) => void }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (open) loadVoices().then((v) => setVoices(v.filter((x) => x.lang.startsWith("en"))));
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Reading settings">
      <div className="space-y-7 px-5 pb-8">
        <div>
          <SectionLabel>Text size</SectionLabel>
          <div className="flex items-center gap-3">
            <button onClick={() => update({ fontSize: Math.max(15, settings.fontSize - 1) })} className="flex h-10 w-10 items-center justify-center rounded-full border border-line" aria-label="Smaller text">
              <Minus size={16} />
            </button>
            <input type="range" min={15} max={30} value={settings.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
            <button onClick={() => update({ fontSize: Math.min(30, settings.fontSize + 1) })} className="flex h-10 w-10 items-center justify-center rounded-full border border-line" aria-label="Bigger text">
              <Plus size={16} />
            </button>
          </div>
          <div className="mt-3 rounded-2xl bg-paper-2 p-3 font-reading" style={{ fontSize: settings.fontSize }}>
            The quick brown fox.
          </div>
        </div>

        <div>
          <SectionLabel>Page color</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => update({ theme: t.id })}
                className={clsx("rounded-2xl border-2 p-3 text-sm font-medium transition", settings.theme === t.id ? "border-accent" : "border-line")}
                style={{ background: t.bg, color: t.fg }}
              >
                <span className="font-reading text-xl">Aa</span>
                <div className="mt-1 text-xs">{t.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>Reading voice</SectionLabel>
          <select
            value={settings.voice ?? ""}
            onChange={(e) => update({ voice: e.target.value || null })}
            className="h-11 w-full rounded-full border border-line bg-paper px-4 text-sm outline-none focus:border-accent"
          >
            <option value="">Best American voice (automatic)</option>
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} · {v.lang}
              </option>
            ))}
          </select>
          <div className="mt-4 flex items-center gap-3 text-sm">
            <span className="w-12 text-ink-3">Slow</span>
            <input type="range" min={0.6} max={1.25} step={0.05} value={settings.rate} onChange={(e) => update({ rate: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
            <span className="w-12 text-right text-ink-3">Fast</span>
          </div>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => speak("This is the voice that will read your books to you.", { voice: settings.voice, rate: settings.rate })}>
            Test voice
          </Button>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-line p-4">
          <div>
            <div className="text-[15px] font-medium">Keep my recordings</div>
            <div className="text-xs text-ink-3">So you can listen back later. They stay on this device. This doesn’t work on phones yet.</div>
          </div>
          <input type="checkbox" checked={settings.saveAudio} onChange={(e) => update({ saveAudio: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" />
        </label>
      </div>
    </Sheet>
  );
}
