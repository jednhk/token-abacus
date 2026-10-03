"use client";

import { useEffect, useRef, useState } from "react";

const BARS = 32;

type SpeechResult = { 0?: { transcript: string } };

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type Session = {
  stream: MediaStream;
  audio: AudioContext;
  recognition: SpeechRec | null;
  heard: { text: string };
  raf: number;
};

export function VoiceBar({
  onCancel,
  onConfirm,
  onError,
}: {
  onCancel: () => void;
  onConfirm: (transcript: string) => void;
  onError: (message: string) => void;
}) {
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const session = useRef<Session | null>(null);
  const ended = useRef(false);
  const onCancelRef = useRef(onCancel);
  const onConfirmRef = useRef(onConfirm);
  const onErrorRef = useRef(onError);
  onCancelRef.current = onCancel;
  onConfirmRef.current = onConfirm;
  onErrorRef.current = onError;

  useEffect(() => {
    let live = true;

    async function start() {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        if (live) onErrorRef.current("Allow the microphone to dictate.");
        return;
      }
      if (!live) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const audio = new AudioContext();
      const source = audio.createMediaStreamSource(stream);
      const analyser = audio.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const bucket = Math.floor(data.length / BARS);
      const heard = { text: "" };
      const recognition = createRecognizer();

      const next: Session = { stream, audio, recognition, heard, raf: 0 };
      session.current = next;

      const draw = () => {
        if (session.current !== next) return;
        analyser.getByteTimeDomainData(data);
        setLevels((current) =>
          current.map((previous, index) => {
            let energy = 0;
            for (let offset = 0; offset < bucket; offset += 1) {
              const sample = (data[index * bucket + offset] - 128) / 128;
              energy += sample * sample;
            }
            const level = Math.min(1, Math.sqrt(energy / bucket) * 5);
            return previous * 0.45 + level * 0.55;
          }),
        );
        next.raf = requestAnimationFrame(draw);
      };
      next.raf = requestAnimationFrame(draw);

      if (recognition) {
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || "en-US";
        recognition.onresult = (event) => {
          let text = "";
          for (let index = 0; index < event.results.length; index += 1) {
            text += event.results[index][0]?.transcript ?? "";
          }
          heard.text = text.replace(/\s+/g, " ").trim();
        };
        recognition.onerror = (event) => {
          if (event.error === "not-allowed" && live && !ended.current) {
            ended.current = true;
            stopSession(session.current, true);
            session.current = null;
            onErrorRef.current("Allow the microphone to dictate.");
          }
        };
        try {
          recognition.start();
        } catch {
          next.recognition = null;
        }
      }
    }

    void start();
    return () => {
      live = false;
      stopSession(session.current, true);
      session.current = null;
    };
  }, []);

  function discard() {
    if (ended.current) return;
    ended.current = true;
    stopSession(session.current, true);
    session.current = null;
    onCancelRef.current();
  }

  function accept() {
    if (ended.current) return;
    ended.current = true;
    const current = session.current;
    const recognition = current?.recognition ?? null;
    if (!current || !recognition) {
      const text = current?.heard.text ?? "";
      stopSession(current, true);
      session.current = null;
      if (text) onConfirmRef.current(text);
      else onErrorRef.current("This browser can't turn speech into text yet.");
      return;
    }
    recognition.onend = () => {
      const text = current.heard.text;
      stopSession(current, false);
      if (session.current === current) session.current = null;
      onConfirmRef.current(text);
    };
    try {
      recognition.stop();
    } catch {
      const text = current.heard.text;
      stopSession(current, true);
      session.current = null;
      onConfirmRef.current(text);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" role="group" aria-label="Listening">
      <div className="flex h-9 min-w-0 flex-1 items-center justify-center gap-[3px]" aria-hidden="true">
        {levels.map((level, index) => (
          <span
            key={index}
            className="w-[2.5px] shrink-0 rounded-full bg-neutral-700"
            style={{ height: `${3 + level * 18}px` }}
          />
        ))}
      </div>
      <button
        type="button"
        aria-label="Discard dictation"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-neutral-200 text-neutral-800 hover:bg-neutral-50"
        onClick={discard}
      >
        <XIcon />
      </button>
      <button
        type="button"
        aria-label="Use this dictation"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-neutral-200 text-neutral-800 hover:bg-neutral-50"
        onClick={accept}
      >
        <CheckIcon />
      </button>
    </div>
  );
}

function stopSession(current: Session | null, abortRecognition: boolean) {
  if (!current) return;
  cancelAnimationFrame(current.raf);
  if (abortRecognition) {
    try {
      current.recognition?.abort();
    } catch {
      /* Already stopped. */
    }
  }
  current.stream.getTracks().forEach((track) => track.stop());
  void current.audio.close();
}

function createRecognizer(): SpeechRec | null {
  const browser = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Recognizer = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  return Recognizer ? new Recognizer() : null;
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5 9.5 17 19 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
