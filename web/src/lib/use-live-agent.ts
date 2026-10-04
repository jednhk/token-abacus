"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, type LiveServerMessage, type Session } from "@google/genai";
import { openLiveAudio, type LiveAudio } from "@/lib/live-audio";
import { ESTIMATE_TOOL, LIVE_API_VERSION, liveConfig } from "@/lib/voice-agent";
import type { OrbState } from "@/components/voice-orb";

export type Caption = { who: "you" | "abacus"; text: string };

type Live = { session: Session | null; audio: LiveAudio; closing: boolean };

type StartResult = "started" | "unavailable" | "failed";

// One Gemini Live conversation at a time: mic in, voice out, and an
// estimate_task tool call that hands the scoped task to the page.
export function useLiveAgent(onTask: (args: Record<string, unknown>) => Promise<unknown>) {
  const [state, setState] = useState<OrbState>("idle");
  const [caption, setCaption] = useState<Caption | null>(null);
  const [note, setNote] = useState("");
  const live = useRef<Live | null>(null);
  const attempt = useRef(0);
  const onTaskRef = useRef(onTask);

  useEffect(() => {
    onTaskRef.current = onTask;
  }, [onTask]);

  const levels = useCallback(
    () => live.current?.audio.levels() ?? { input: 0, output: 0 },
    [],
  );

  const stop = useCallback(() => {
    attempt.current += 1;
    const current = live.current;
    live.current = null;
    if (current) {
      current.closing = true;
      current.session?.close();
      current.audio.close();
    }
    setState("idle");
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async (): Promise<StartResult> => {
    if (live.current || state !== "idle") return "started";
    const ticket = ++attempt.current;
    setNote("");
    setCaption(null);
    setState("connecting");

    let grant: { available: boolean; token?: string; model?: string };
    try {
      const response = await fetch("/api/live-token", { method: "POST" });
      grant = await response.json();
    } catch {
      grant = { available: false };
    }
    if (attempt.current !== ticket) return "failed";
    if (!grant.available || !grant.token || !grant.model) {
      setState("idle");
      return "unavailable";
    }

    let audio: LiveAudio;
    try {
      audio = await openLiveAudio((chunk) => {
        live.current?.session?.sendRealtimeInput({
          audio: { data: chunk, mimeType: "audio/pcm;rate=16000" },
        });
      });
    } catch {
      setState("idle");
      setNote("Allow the microphone to talk to Abacus.");
      return "failed";
    }
    if (attempt.current !== ticket) {
      audio.close();
      return "failed";
    }
    const current: Live = { session: null, audio, closing: false };
    live.current = current;

    let speaker: Caption["who"] | null = null;
    const say = (who: Caption["who"], text: string) => {
      if (!text) return;
      setCaption((previous) =>
        speaker === who && previous ? { who, text: previous.text + text } : { who, text: text.trimStart() },
      );
      speaker = who;
    };

    const handle = async (message: LiveServerMessage) => {
      const content = message.serverContent;
      if (content?.interrupted) current.audio.flush();
      for (const part of content?.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) current.audio.play(part.inlineData.data);
      }
      if (content?.inputTranscription?.text) say("you", content.inputTranscription.text);
      if (content?.outputTranscription?.text) say("abacus", content.outputTranscription.text);

      const calls = message.toolCall?.functionCalls ?? [];
      if (!calls.length) return;
      setState("thinking");
      const functionResponses = await Promise.all(
        calls.map(async (call) => {
          const result =
            call.name === ESTIMATE_TOOL
              ? await onTaskRef.current(call.args ?? {}).catch(() => "The estimate failed. Ask them to try again.")
              : "Unknown tool.";
          return { id: call.id, name: call.name, response: { result } };
        }),
      );
      if (live.current !== current) return;
      setState("live");
      current.session?.sendToolResponse({ functionResponses });
    };

    try {
      const ai = new GoogleGenAI({
        apiKey: grant.token,
        httpOptions: { apiVersion: LIVE_API_VERSION },
      });
      current.session = await ai.live.connect({
        model: grant.model,
        config: liveConfig(),
        callbacks: {
          onmessage: (message) => void handle(message),
          onerror: () => {
            if (live.current === current) setNote("The voice line dropped. Tap the orb to try again.");
          },
          onclose: () => {
            if (current.closing) return;
            current.audio.close();
            if (live.current === current) {
              live.current = null;
              setState("idle");
              setNote((previous) => previous || "Voice session ended. Tap the orb to talk again.");
            }
          },
        },
      });
    } catch {
      if (live.current === current) stop();
      setNote("Couldn't reach the voice agent. Type your task instead.");
      return "failed";
    }
    if (live.current !== current) {
      current.session.close();
      return "failed";
    }
    setState("live");
    current.session.sendClientContent({
      turns: [{ role: "user", parts: [{ text: "Hi." }] }],
      turnComplete: true,
    });
    return "started";
  }, [state, stop]);

  return { state, caption, note, levels, start, stop, active: state !== "idle" };
}
