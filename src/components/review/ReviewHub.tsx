"use client";

import clsx from "clsx";
import { ChartLine, Layers } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { ProgressView } from "../progress/ProgressView";
import { ReviewView } from "./ReviewView";

type Tab = "review" | "progress";
const TABS = [
  { id: "review" as const, label: "Review", icon: Layers, path: "/review" },
  { id: "progress" as const, label: "Progress", icon: ChartLine, path: "/progress" },
];

/** Flashcards and progress charts on one page, with a switch at the top. */
export function ReviewHub({ initial }: { initial: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  const choose = (t: (typeof TABS)[number]) => {
    setTab(t.id);
    window.history.replaceState(window.history.state, "", t.path);
  };
  return (
    <>
      <div className="flex justify-center px-4 pt-6 md:pt-10">
        <div className="inline-flex rounded-full border border-line bg-card p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => choose(t)}
              className={clsx("relative flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium transition-colors", tab === t.id ? "text-paper" : "text-ink-2 hover:text-ink")}
            >
              {tab === t.id && <motion.span layoutId="review-tab" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", damping: 30, stiffness: 400 }} />}
              <t.icon size={16} className="relative" />
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="[&>div]:pt-6 md:[&>div]:pt-8">{tab === "review" ? <ReviewView /> : <ProgressView />}</div>
    </>
  );
}
