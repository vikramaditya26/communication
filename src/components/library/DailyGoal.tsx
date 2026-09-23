"use client";

import { CalendarPlus, Check, Minus, Plus, Settings2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Day } from "@/lib/store";
import { useStored } from "@/lib/store";
import { Button, Sheet } from "../ui";

export type Goal = { pages: number; minutes: number; reminder: string };
export const DEFAULT_GOAL: Goal = { pages: 5, minutes: 5, reminder: "20:00" };

function Ring({ pages, minutes }: { pages: number; minutes: number }) {
  const arc = (r: number, value: number, color: string, delay: number) => {
    const c = 2 * Math.PI * r;
    return (
      <>
        <circle cx={60} cy={60} r={r} stroke="currentColor" strokeWidth={10} className="text-ink/10" fill="none" />
        <motion.circle
          cx={60}
          cy={60}
          r={r}
          stroke={color}
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.min(1, value)) }}
          transition={{ duration: 1.1, delay, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </>
    );
  };
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
      {arc(52, pages, "var(--accent)", 0.2)}
      {arc(38, minutes, "var(--good)", 0.35)}
    </svg>
  );
}

/** Tiny burst of dots when the goal is reached. */
function Burst() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
            style={{ background: i % 2 ? "var(--accent)" : "var(--good)" }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * 70, y: Math.sin(a) * 70, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

function downloadReminder(time: string) {
  const [h, m] = time.split(":");
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const url = typeof window !== "undefined" ? window.location.origin : "";
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vaani//EN",
    "BEGIN:VEVENT",
    `UID:vaani-daily-${stamp}@vaani`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${ymd}T${h}${m}00`,
    "DURATION:PT15M",
    "RRULE:FREQ=DAILY",
    "SUMMARY:English practice with Vaani",
    `DESCRIPTION:Read a few pages out loud. ${url}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "TRIGGER:PT0M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Time to practice your English",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vaani-reminder.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function DailyGoal({ today }: { today?: Day }) {
  const [stored, save] = useStored<Goal>("pref:goal");
  const goal = { ...DEFAULT_GOAL, ...stored };
  const [editing, setEditing] = useState(false);
  const pages = today?.pages ?? 0;
  const minutes = Math.round((today?.spoken ?? 0) / 60);
  const pagesPct = pages / goal.pages;
  const minutesPct = minutes / goal.minutes;
  const done = pagesPct >= 1 && minutesPct >= 1;

  // Celebrate once, the first time the goal is reached today.
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    if (!done) return;
    const date = new Date().toLocaleDateString("en-CA");
    try {
      if (localStorage.getItem("goal-celebrated") === date) return;
      localStorage.setItem("goal-celebrated", date);
    } catch {}
    const show = setTimeout(() => setBurst(true), 900);
    const hide = setTimeout(() => setBurst(false), 2200);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [done]);

  return (
    <>
      <button onClick={() => setEditing(true)} className="group flex w-full items-center gap-4 rounded-3xl px-3 py-2 text-left transition hover:bg-ink/[0.03]">
        <div className="relative h-[76px] w-[76px] shrink-0">
          <Ring pages={pagesPct} minutes={minutesPct} />
          <div className="absolute inset-0 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {done ? (
                <motion.span key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex h-7 w-7 items-center justify-center rounded-full bg-good text-white">
                  <Check size={16} strokeWidth={3} />
                </motion.span>
              ) : (
                <motion.span key="pct" className="text-xs font-semibold tabular-nums text-ink-2">
                  {Math.round(Math.min(1, (Math.min(1, pagesPct) + Math.min(1, minutesPct)) / 2) * 100)}%
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          {burst && <Burst />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[15px] font-medium">
            {done ? "Goal done for today" : "Today’s goal"}
            <Settings2 size={13} className="text-ink-3 opacity-0 transition group-hover:opacity-100" />
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-2">
            <span className="h-2 w-2 rounded-full bg-accent" /> {Math.min(pages, 999)} / {goal.pages} pages
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-2">
            <span className="h-2 w-2 rounded-full bg-good" /> {minutes} / {goal.minutes} min speaking
          </div>
        </div>
      </button>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Daily goal">
        <div className="space-y-6 px-5 pb-8">
          <Stepper label="Pages to read" value={goal.pages} min={1} max={50} onChange={(v) => save({ ...goal, pages: v })} />
          <Stepper label="Minutes of speaking" value={goal.minutes} min={1} max={60} onChange={(v) => save({ ...goal, minutes: v })} />
          <div className="rounded-3xl border border-line p-4">
            <div className="text-[15px] font-medium">Daily reminder</div>
            <p className="mt-1 text-sm text-ink-2">Adds a repeating event to your phone or Mac calendar, so you get a notification every day.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="time"
                value={goal.reminder}
                onChange={(e) => save({ ...goal, reminder: e.target.value || DEFAULT_GOAL.reminder })}
                className="h-10 rounded-full border border-line bg-paper px-4 text-sm outline-none focus:border-accent"
              />
              <Button variant="outline" icon={<CalendarPlus size={16} />} onClick={() => downloadReminder(goal.reminder)}>
                Add to calendar
              </Button>
            </div>
          </div>
        </div>
      </Sheet>
    </>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-[15px] font-medium">{label}</div>
      <div className="flex items-center gap-3">
        <button onClick={() => onChange(Math.max(min, value - 1))} className="flex h-10 w-10 items-center justify-center rounded-full border border-line" aria-label="Less">
          <Minus size={16} />
        </button>
        <span className="w-8 text-center font-display text-2xl tabular-nums">{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} className="flex h-10 w-10 items-center justify-center rounded-full border border-line" aria-label="More">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
