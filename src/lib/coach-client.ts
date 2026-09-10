"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoachErrorCode, CoachTask, CoachTasks } from "./coach";
import { aiKey, read, write } from "./store";

export class CoachError extends Error {
  constructor(
    public code: CoachErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// Answers that never change for the same input are cached on this device.
const CACHEABLE: CoachTask[] = ["word", "text", "page"];

export async function askCoach<T extends CoachTask>(task: T, input: CoachTasks[T]["input"]): Promise<CoachTasks[T]["output"]> {
  const key = aiKey(task, input);
  if (CACHEABLE.includes(task)) {
    const hit = await read<CoachTasks[T]["output"]>(key);
    if (hit) return hit;
  }
  let password = "";
  try {
    password = localStorage.getItem("app-password") ?? "";
  } catch {}
  const res = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-app-password": password },
    body: JSON.stringify({ task, input }),
  });
  const body = await res.json().catch(() => ({ error: "failed", message: "The coach is not reachable." }));
  if (!res.ok) throw new CoachError(body.error ?? "failed", body.message ?? "Something went wrong.");
  if (CACHEABLE.includes(task)) await write(key, body.result);
  return body.result;
}

type State<T> = { key: string | null; data?: T; error?: CoachError; loading: boolean };

/**
 * Runs a coach task.
 * auto: true    – runs whenever `input` changes
 * auto: "cache" – shows a saved answer if there is one, otherwise waits for run()
 */
export function useCoach<T extends CoachTask>(task: T, input: CoachTasks[T]["input"] | null, { auto = false }: { auto?: boolean | "cache" } = {}) {
  const inputKey = input ? JSON.stringify(input) : null;
  const [state, setState] = useState<State<CoachTasks[T]["output"]>>({ key: null, loading: false });
  const latest = useRef(0);

  const fetchFor = useCallback(
    async (key: string) => {
      const id = ++latest.current;
      try {
        const data = await askCoach(task, JSON.parse(key) as CoachTasks[T]["input"]);
        if (id === latest.current) setState({ key, data, loading: false });
        return data;
      } catch (e) {
        const error = e instanceof CoachError ? e : new CoachError("failed", e instanceof Error ? e.message : String(e));
        if (id === latest.current) setState({ key, error, loading: false });
      }
    },
    [task],
  );

  const run = useCallback(() => {
    if (!inputKey) return;
    setState({ key: inputKey, loading: true });
    return fetchFor(inputKey);
  }, [inputKey, fetchFor]);

  useEffect(() => {
    if (!inputKey) return;
    // fetchFor only sets state after the network request resolves, so this doesn't cause a synchronous re-render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (auto === true) fetchFor(inputKey);
    else if (auto === "cache") {
      const id = latest.current;
      read<CoachTasks[T]["output"]>(aiKey(task, JSON.parse(inputKey))).then((hit) => {
        if (hit && id === latest.current) setState({ key: inputKey, data: hit, loading: false });
      });
    }
  }, [auto, inputKey, fetchFor, task]);

  // Answers belong to the input they were asked for. In auto mode a new input is loading straight away.
  const current = state.key === inputKey ? state : { data: undefined, error: undefined, loading: auto === true && Boolean(inputKey) };
  return { data: current.data, error: current.error, loading: current.loading, run };
}
