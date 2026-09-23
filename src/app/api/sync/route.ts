// Stores changes from each device in Upstash Redis, so the Mac and the phone can share progress.
// Set up in Vercel: Storage → Create Database → Upstash for Redis → connect to this project.
//
// vaani:data   hash        key → JSON { v, t, d }  (value, time changed on the device, deleted)
// vaani:times  sorted set  key scored by when the server received it, so "what changed since" is quick

export const maxDuration = 30;

type Entry = { k: string; v?: unknown; t: number; d?: boolean };

const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const SYNCED = /^(progress|saved|day|rec|attempt|miss|drill|chat|pref):/;
const MAX_VALUE = 200_000; // characters; recordings are sent without audio

async function redis(commands: (string | number)[][]): Promise<unknown[]> {
  const res = await fetch(`${url()!.replace(/\/+$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Database error ${res.status}`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  const failed = out.find((r) => r.error);
  if (failed) throw new Error(failed.error);
  return out.map((r) => r.result);
}

const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

export async function POST(request: Request) {
  const password = process.env.APP_PASSWORD;
  if (password && request.headers.get("x-app-password") !== password) {
    return Response.json({ error: "locked", message: "This app is locked. Enter the app password." }, { status: 401 });
  }
  if (!url() || !token()) {
    return Response.json({ error: "not_configured", message: "Sync isn’t set up yet." }, { status: 503 });
  }

  const body = (await request.json()) as { since?: number; changes?: Entry[] };
  const since = Number(body.since) || 0;
  const changes = (body.changes ?? []).filter((c) => typeof c?.k === "string" && SYNCED.test(c.k) && Number.isFinite(c.t)).slice(0, 500);
  const now = Date.now();

  try {
    // Save incoming changes, but never let an older edit overwrite a newer one.
    if (changes.length) {
      const [existing] = await redis([["HMGET", "vaani:data", ...changes.map((c) => c.k)]]);
      const writes: (string | number)[][] = [];
      changes.forEach((c, i) => {
        const prev = (existing as (string | null)[])[i];
        const prevT = prev ? (JSON.parse(prev) as Entry).t : 0;
        if (c.t <= prevT) return;
        const json = JSON.stringify({ v: c.d ? null : c.v, t: c.t, d: c.d || undefined });
        if (json.length > MAX_VALUE) return;
        writes.push(["HSET", "vaani:data", c.k, json], ["ZADD", "vaani:times", now, c.k]);
      });
      for (const batch of chunks(writes, 200)) await redis(batch);
    }

    // Send back everything that changed since this device last asked.
    const [keys] = await redis([["ZRANGEBYSCORE", "vaani:times", `(${since}`, "+inf"]]);
    const entries: Entry[] = [];
    for (const batch of chunks(keys as string[], 300)) {
      const [values] = await redis([["HMGET", "vaani:data", ...batch]]);
      (values as (string | null)[]).forEach((json, i) => {
        if (json) entries.push({ k: batch[i], ...(JSON.parse(json) as Omit<Entry, "k">) });
      });
    }
    return Response.json({ now, entries });
  } catch (error) {
    return Response.json({ error: "failed", message: error instanceof Error ? error.message : "Sync failed." }, { status: 502 });
  }
}
