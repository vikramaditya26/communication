"use client";

import clsx from "clsx";
import { ArrowRight, Bookmark, BookmarkCheck, CircleAlert, KeyRound, RotateCcw, Square, Volume2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { BetterWord, Correction } from "@/lib/coach";
import type { CoachError } from "@/lib/coach-client";
import { speak, stopSpeaking } from "@/lib/speech";
import { Button } from "../ui";

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3", className)}>{children}</div>;
}

export function SpeakButton({ text, label = "Listen", rate, size = "sm", variant = "soft" }: { text: string; label?: string; rate?: number; size?: "sm" | "md"; variant?: "soft" | "ghost" | "outline" }) {
  const [on, setOn] = useState(false);
  useEffect(() => () => void (on && stopSpeaking()), [on]);
  return (
    <Button
      size={size}
      variant={variant}
      icon={on ? <Square size={13} fill="currentColor" /> : <Volume2 size={15} />}
      onClick={() => {
        if (on) {
          stopSpeaking();
          setOn(false);
        } else {
          setOn(true);
          speak(text, { rate, onEnd: () => setOn(false) });
        }
      }}
    >
      {on ? "Stop" : label}
    </Button>
  );
}

export function SaveToggle({ saved, onSave, label = "Save" }: { saved: boolean; onSave: () => void; label?: string }) {
  return (
    <Button size="sm" variant={saved ? "soft" : "outline"} icon={saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />} onClick={onSave} disabled={saved}>
      {saved ? "Saved" : label}
    </Button>
  );
}

export function CoachNotice({ error, onRetry }: { error: CoachError; onRetry?: () => void }) {
  if (error.code === "no_key" || error.code === "bad_key") {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-paper-2 p-4">
        <div className="flex items-center gap-2 font-medium">
          <KeyRound size={16} className="text-accent" />
          {error.code === "no_key" ? "AI help isn’t set up yet" : "The AI key didn’t work"}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
          {error.code === "no_key" ? (
            <>
              Get a free key from Google AI Studio and add it in Vercel as <code className="rounded bg-ink/5 px-1 py-0.5 text-[12px]">GEMINI_API_KEY</code>, then redeploy. Reading and the pronunciation colors work without it.
            </>
          ) : (
            error.message
          )}
        </p>
      </div>
    );
  }
  if (error.code === "locked") {
    return <LockedNotice onRetry={onRetry} />;
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-bad-soft p-4 text-sm">
      <CircleAlert size={18} className="mt-0.5 shrink-0 text-bad" />
      <div className="min-w-0 flex-1">
        <div className="text-ink">{error.message}</div>
        {onRetry && (
          <button onClick={onRetry} className="mt-2 inline-flex items-center gap-1.5 font-medium text-bad hover:underline">
            <RotateCcw size={14} /> Try again
          </button>
        )}
      </div>
    </div>
  );
}

function LockedNotice({ onRetry }: { onRetry?: () => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="rounded-2xl border border-line bg-paper-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          localStorage.setItem("app-password", value);
        } catch {}
        onRetry?.();
      }}
    >
      <div className="flex items-center gap-2 font-medium">
        <KeyRound size={16} className="text-accent" /> Enter your app password
      </div>
      <p className="mt-1 text-sm text-ink-2">This keeps other people from using your AI credits.</p>
      <div className="mt-3 flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-card px-4 text-sm outline-none focus:border-accent"
          placeholder="Password"
        />
        <Button type="submit">Unlock</Button>
      </div>
    </form>
  );
}

export function Corrections({ items, onSave, savedIds }: { items: Correction[]; onSave?: (c: Correction) => void; savedIds?: Set<string> }) {
  if (!items.length) return <p className="text-sm text-ink-2">No grammar mistakes this time.</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((c, i) => (
        <motion.li key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="rounded-2xl border border-line bg-card p-3.5">
          <div className="text-[15px] leading-snug text-ink-2 line-through decoration-bad/60 decoration-2">{c.youSaid}</div>
          <div className="mt-1 flex items-start gap-2 text-[15px] font-medium leading-snug text-good">
            <ArrowRight size={16} className="mt-0.5 shrink-0" />
            <span>{c.better}</span>
          </div>
          <div className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{c.why}</div>
          {onSave && (
            <div className="mt-2 flex gap-2">
              <SpeakButton text={c.better} label="Hear it" variant="ghost" />
              <SaveToggle saved={savedIds?.has(c.better) ?? false} onSave={() => onSave(c)} />
            </div>
          )}
        </motion.li>
      ))}
    </ul>
  );
}

export function BetterWords({ items }: { items: BetterWord[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-2">
      {items.map((b, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-2xl bg-paper-2 px-3.5 py-3 text-[15px]">
          <span className="text-ink-2">{b.instead}</span>
          <ArrowRight size={14} className="self-center text-ink-3" />
          <span className="font-semibold text-accent">{b.try}</span>
          <span className="w-full text-[13px] text-ink-2">{b.why}</span>
        </li>
      ))}
    </ul>
  );
}

export function ScoreRing({ value, max = 100, label, size = 76, suffix = "" }: { value: number; max?: number; label: string; size?: number; suffix?: string }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const color = pct >= 0.85 ? "var(--good)" : pct >= 0.6 ? "var(--warn)" : "var(--bad)";
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={6} className="text-ink/10" fill="none" />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={6}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - pct) }}
            transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-display text-xl tabular-nums">
          {Math.round(value)}
          {suffix && <span className="ml-0.5 text-xs text-ink-3">{suffix}</span>}
        </div>
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{label}</div>
    </div>
  );
}

const urlUsers = new Map<string, number>();

export function AudioPlayback({ blob, label = "Hear yourself" }: { blob: Blob; label?: string }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => {
    urlUsers.set(url, (urlUsers.get(url) ?? 0) + 1);
    return () => {
      urlUsers.set(url, (urlUsers.get(url) ?? 1) - 1);
      // Wait a tick: in development React mounts effects twice.
      setTimeout(() => {
        if (urlUsers.get(url)) return;
        urlUsers.delete(url);
        URL.revokeObjectURL(url);
      }, 0);
    };
  }, [url]);
  return (
    <div className="rounded-2xl bg-paper-2 p-3">
      <div className="mb-1.5 text-xs font-medium text-ink-3">{label}</div>
      <audio src={url} controls className="h-9 w-full" />
    </div>
  );
}
