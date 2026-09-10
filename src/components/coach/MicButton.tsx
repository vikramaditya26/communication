"use client";

import clsx from "clsx";
import { Mic, Square } from "lucide-react";
import { motion } from "motion/react";
import { Spinner } from "../ui";

export function MicButton({
  state,
  onStart,
  onStop,
  size = 72,
  className,
}: {
  state: "idle" | "listening" | "stopping" | "done" | "error";
  onStart: () => void;
  onStop: () => void;
  size?: number;
  className?: string;
}) {
  const listening = state === "listening";
  const stopping = state === "stopping";
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={listening ? onStop : stopping ? undefined : onStart}
      aria-label={listening ? "Stop" : "Start speaking"}
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center rounded-full text-white shadow-lift transition-colors",
        listening ? "recording-pulse bg-bad" : "bg-accent hover:brightness-110",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {stopping ? <Spinner className="h-6 w-6" /> : listening ? <Square size={size * 0.3} fill="currentColor" /> : <Mic size={size * 0.4} />}
    </motion.button>
  );
}
