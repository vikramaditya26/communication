"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isMobile, listen, speechRecognitionSupported, startRecorder, type Listener } from "./speech";

export type CaptureState = "idle" | "listening" | "stopping" | "done" | "error";

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.",
  "service-not-allowed": "Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.",
  "audio-capture": "No microphone was found. Check that one is connected.",
  network: "Listening needs an internet connection. Check your connection and try again.",
  unsupported: "This browser can’t listen to speech. Please use Google Chrome on your Mac or Android phone.",
};

export type CaptureResult = { transcript: string; elapsed: number; audio: Blob | null };

/** Listens to the learner, keeps the transcript, and (optionally) records their voice. */
export function useSpeechCapture({ saveAudio = true, onFinish }: { saveAudio?: boolean; onFinish?: (result: CaptureResult) => void } = {}) {
  const [state, setState] = useState<CaptureState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listener = useRef<Listener | null>(null);
  const recorder = useRef<{ stop: () => Promise<Blob | null> } | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const finished = useRef(false);
  const transcriptRef = useRef("");
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const finish = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    clearTimer();
    const took = Date.now() - startedAt.current;
    setElapsed(took);
    const blob = recorder.current ? await recorder.current.stop() : null;
    recorder.current = null;
    setAudio(blob);
    setInterim("");
    setState((s) => (s === "error" ? s : "done"));
    onFinishRef.current?.({ transcript: transcriptRef.current.trim(), elapsed: took, audio: blob });
  }, []);

  const start = useCallback(async () => {
    if (!speechRecognitionSupported()) {
      setError(ERRORS.unsupported);
      setState("error");
      return;
    }
    finished.current = false;
    transcriptRef.current = "";
    setTranscript("");
    setInterim("");
    setAudio(null);
    setError(null);
    setElapsed(0);
    // Phones usually can't share the microphone between recording and listening.
    if (saveAudio && !isMobile()) recorder.current = await startRecorder();
    startedAt.current = Date.now();
    listener.current = listen({
      onText: (finalText, interimText) => {
        transcriptRef.current = finalText;
        setTranscript(finalText);
        setInterim(interimText);
      },
      onError: (code) => {
        setError(ERRORS[code] ?? `Listening stopped (${code}). Please try again.`);
        setState("error");
        finish();
      },
      onEnd: finish,
    });
    timer.current = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    setState("listening");
  }, [saveAudio, finish]);

  const stop = useCallback(() => {
    if (!listener.current) return;
    setState("stopping");
    listener.current.stop();
    listener.current = null;
    // Some browsers never fire "end"; don't leave the learner waiting.
    setTimeout(finish, 2500);
  }, [finish]);

  const reset = useCallback(() => {
    listener.current?.stop();
    listener.current = null;
    clearTimer();
    setState("idle");
    setTranscript("");
    setInterim("");
    setAudio(null);
    setError(null);
    setElapsed(0);
  }, []);

  useEffect(
    () => () => {
      listener.current?.stop();
      recorder.current?.stop();
      clearTimer();
    },
    [],
  );

  return { state, transcript, interim, elapsed, audio, error, start, stop, reset };
}

export const formatClock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
