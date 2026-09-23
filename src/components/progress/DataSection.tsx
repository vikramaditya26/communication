"use client";

import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { readEntries, SYNC_PREFIXES, write } from "@/lib/store";
import { Button } from "../ui";
import { SyncPanel } from "./SyncPanel";

/** Everything worth keeping, without voice recordings (too big) or cached AI answers. */
async function collect() {
  const data: Record<string, unknown> = {};
  for (const prefix of SYNC_PREFIXES) {
    for (const [k, v] of await readEntries<Record<string, unknown>>(prefix)) {
      if (v && typeof v === "object" && "audio" in v) {
        const rest = { ...v };
        delete rest.audio;
        data[k] = rest;
      } else data[k] = v;
    }
  }
  return data;
}

export function DataSection() {
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportData = async () => {
    const data = await collect();
    const blob = new Blob([JSON.stringify({ app: "vaani", version: 1, exportedAt: new Date().toISOString(), data }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vaani-backup-${new Date().toLocaleDateString("en-CA")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setStatus(`Saved ${Object.keys(data).length} items to a backup file.`);
  };

  const importData = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.app !== "vaani" || typeof parsed.data !== "object") throw new Error();
      const entries = Object.entries(parsed.data as Record<string, unknown>).filter(([k]) => SYNC_PREFIXES.some((p) => k.startsWith(p)));
      for (const [k, v] of entries) await write(k, v);
      setStatus(`Restored ${entries.length} items.`);
    } catch {
      setStatus("That file isn’t a Vaani backup.");
    }
  };

  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="font-display text-2xl">Your data</h2>
      <p className="mt-1 max-w-xl text-sm text-ink-2">Your progress is saved in this browser. Sync it between your Mac and phone, or keep a backup file.</p>

      <SyncPanel />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" icon={<Download size={16} />} onClick={exportData}>
          Download backup
        </Button>
        <Button variant="outline" icon={<Upload size={16} />} onClick={() => fileRef.current?.click()}>
          Restore from backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importData(f);
            e.target.value = "";
          }}
        />
      </div>
      {status && <p className="mt-3 text-sm text-ink-2">{status}</p>}
    </section>
  );
}
