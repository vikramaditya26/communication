"use client";

import clsx from "clsx";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { retrySync, syncNow, useSyncStatus } from "@/lib/sync";
import { useNow } from "@/lib/useNow";
import { Button } from "../ui";

const ago = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export function SyncPanel() {
  const status = useSyncStatus();
  const now = useNow();

  if (status.state === "not_configured") {
    return (
      <div className="mt-5 rounded-3xl border border-dashed border-line p-5">
        <div className="flex items-center gap-2 font-medium">
          <CloudOff size={18} className="text-ink-3" /> Sync between your Mac and phone is not set up yet
        </div>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2">
          <li>Open your project on vercel.com and go to the <b>Storage</b> tab.</li>
          <li>
            Choose <b>Create Database</b>, then <b>Upstash for Redis</b> (the free plan is enough), and connect it to this project.
          </li>
          <li>
            Go to <b>Deployments</b> and <b>Redeploy</b>.
          </li>
        </ol>
        <p className="mt-3 text-xs text-ink-3">After that, open the app on both devices and your progress will follow you.</p>
        <Button className="mt-4" size="sm" variant="outline" icon={<RefreshCw size={14} />} onClick={retrySync}>
          Check again
        </Button>
      </div>
    );
  }

  const syncing = status.state === "syncing";
  return (
    <div className="mt-5 flex flex-wrap items-center gap-4 rounded-3xl border border-line bg-card p-4">
      <span className={clsx("flex h-10 w-10 items-center justify-center rounded-2xl", status.state === "error" ? "bg-bad-soft text-bad" : "bg-good-soft text-good")}>
        {status.state === "error" ? <CloudOff size={19} /> : <Cloud size={19} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {syncing
            ? "Syncing…"
            : status.state === "ok"
              ? "Synced with your other devices"
              : status.state === "error"
                ? "Sync didn’t work"
                : status.state === "locked"
                  ? "Enter the app password to sync"
                  : "Sync is on"}
        </div>
        <div className="text-sm text-ink-3">
          {status.state === "error"
            ? status.message
            : status.at && now
              ? `Last synced ${ago(now - status.at)}${status.received ? ` · ${status.received} updates received` : ""}`
              : "Your progress, saved words and conversations are shared between devices."}
        </div>
      </div>
      <Button size="sm" variant="outline" icon={<RefreshCw size={14} className={clsx(syncing && "animate-spin")} />} onClick={() => syncNow()} disabled={syncing}>
        Sync now
      </Button>
    </div>
  );
}
