"use client";

import { useEffect, useRef, useState } from "react";
import { SolutionDiagram } from "@/components/solution-diagram";
import { VoiceBar } from "@/components/voice-bar";
import {
  questionsFor,
  shapeEstimate,
  type ClarifyChoice,
  type ClarifyPick,
  type ClarifyQuestion,
} from "@/lib/clarify";
import {
  developerStarters,
  promptPlaceholder,
  type InputMode,
} from "@/lib/content";
import { demoAnswer, type DemoAnswer } from "@/lib/demo-answer";

type ThreadItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "note"; text: string }
  | {
      id: string;
      kind: "ask";
      question: ClarifyQuestion;
      step: number;
      total: number;
      locked: boolean;
      picked?: string;
    }
  | {
      id: string;
      kind: "estimate";
      phase: "searching" | "done";
      prose: string;
      answer?: DemoAnswer;
    };

export function HomeStudio({
  mode,
  onMode,
}: {
  mode: InputMode;
  onMode: (mode: InputMode) => void;
}) {
  const [threads, setThreads] = useState<Record<InputMode, ThreadItem[]>>({
    prompt: [],
    natural: [],
  });
  const [drafts, setDrafts] = useState<Record<InputMode, string>>({ prompt: "", natural: "" });
  const [pendingMode, setPendingMode] = useState<Record<InputMode, boolean>>({
    prompt: false,
    natural: false,
  });
  const [recording, setRecording] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");
  const promptMode = mode === "prompt";
  const items = threads[mode];
  const draft = drafts[mode];
  const pending = pendingMode[mode];
  const field = useRef<HTMLTextAreaElement>(null);
  const request = useRef<Record<InputMode, number>>({ prompt: 0, natural: 0 });
  const topic = useRef("");
  const plan = useRef<ClarifyQuestion[]>([]);
  const picks = useRef<ClarifyPick[]>([]);
  const busy = useRef(false);
  const asking = items.some((item) => item.kind === "ask" && !item.locked);
  const open = items.length > 0;

  function updateThread(lane: InputMode, updater: (current: ThreadItem[]) => ThreadItem[]) {
    setThreads((current) => ({ ...current, [lane]: updater(current[lane]) }));
  }

  function setDraft(value: string | ((current: string) => string)) {
    setDrafts((current) => ({
      ...current,
      [mode]: typeof value === "function" ? value(current[mode]) : value,
    }));
  }

  function setPending(lane: InputMode, value: boolean) {
    setPendingMode((current) => ({ ...current, [lane]: value }));
  }

  useEffect(() => {
    if (window.location.hash !== "#workspace") return;
    document.getElementById("workspace")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  }, [draft, recording, open]);

  useEffect(() => {
    const latest = document.querySelector("[data-turn]:last-of-type");
    latest?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [items]);

  useEffect(() => {
    setRecording(false);
    setVoiceNote("");
  }, [mode]);

  function begin(text: string) {
    const lane: InputMode = promptMode ? "prompt" : "natural";
    topic.current = text;
    if (lane === "prompt") {
      const estimateId = crypto.randomUUID();
      updateThread(lane, (current) => [
        ...current,
        { id: crypto.randomUUID(), kind: "user", text },
        { id: estimateId, kind: "estimate", phase: "searching", prose: "" },
      ]);
      const ticket = ++request.current[lane];
      setPending(lane, true);
      void finishDirect(lane, estimateId, text, ticket);
      return;
    }
    const questions = questionsFor(text);
    plan.current = questions;
    picks.current = [];
    updateThread(lane, (current) => [
      ...current,
      { id: crypto.randomUUID(), kind: "user", text },
      {
        id: crypto.randomUUID(),
        kind: "note",
        text: "A few questions first, so the scope is closer.",
      },
      {
        id: crypto.randomUUID(),
        kind: "ask",
        question: questions[0],
        step: 1,
        total: questions.length,
        locked: false,
      },
    ]);
  }

  function reply(askId: string, choice: ClarifyChoice) {
    if (pending || busy.current) return;
    const ask = items.find((item) => item.id === askId && item.kind === "ask" && !item.locked);
    if (!ask || ask.kind !== "ask") return;
    busy.current = true;
    picks.current = [
      ...picks.current,
      { ask: ask.question.ask, label: choice.label, weight: choice.weight },
    ];
    const nextStep = ask.step + 1;
    const estimateId = crypto.randomUUID();
    updateThread("natural", (current) => {
      const locked = current.map((item) =>
        item.id === askId && item.kind === "ask" ? { ...item, locked: true, picked: choice.label } : item,
      );
      const user = { id: crypto.randomUUID(), kind: "user" as const, text: choice.label };
      if (nextStep <= ask.total) {
        return [
          ...locked,
          user,
          {
            id: crypto.randomUUID(),
            kind: "ask" as const,
            question: plan.current[ask.step],
            step: nextStep,
            total: ask.total,
            locked: false,
          },
        ];
      }
      return [
        ...locked,
        user,
        { id: estimateId, kind: "estimate" as const, phase: "searching" as const, prose: "" },
      ];
    });
    if (nextStep > ask.total) {
      const ticket = ++request.current.natural;
      setPending("natural", true);
      void finishScoped(estimateId, ticket);
      return;
    }
    busy.current = false;
  }

  async function finishDirect(lane: InputMode, id: string, text: string, ticket: number) {
    const answer = await settleChart(text, [], demoAnswer(text));
    if (request.current[lane] !== ticket) return;
    updateThread(lane, (current) =>
      current.map((item) =>
        item.id === id && item.kind === "estimate"
          ? { ...item, phase: "done", prose: answer.prose, answer }
          : item,
      ),
    );
    setPending(lane, false);
  }

  async function finishScoped(id: string, ticket: number) {
    const chosen = picks.current;
    const answer = await settleChart(
      topic.current,
      chosen.map((pick) => `${pick.ask} ${pick.label}`),
      shapeEstimate(topic.current, chosen),
    );
    if (request.current.natural !== ticket) return;
    updateThread("natural", (current) =>
      current.map((item) =>
        item.id === id && item.kind === "estimate"
          ? { ...item, phase: "done", prose: answer.prose, answer }
          : item,
      ),
    );
    setPending("natural", false);
    busy.current = false;
  }

  function send(text: string) {
    const value = text.trim();
    if (!value || pending) return;
    const openAsk = [...items].reverse().find((item) => item.kind === "ask" && !item.locked);
    if (openAsk && openAsk.kind === "ask") {
      reply(openAsk.id, { label: value, weight: 1 });
    } else {
      begin(value);
    }
    setDraft("");
    setVoiceNote("");
  }

  return (
    <section id="workspace" className="scroll-mt-24 px-4 pb-4 sm:px-6" aria-labelledby="workspace-title">
      <h2 id="workspace-title" className="sr-only">
        Estimate
      </h2>
      <div className="mx-auto flex max-w-3xl flex-col">
        <div
          role="radiogroup"
          aria-label="Input type"
          className="mx-auto mb-4 inline-flex items-center rounded-full bg-neutral-100 p-1"
        >
          <ModeButton selected={promptMode} onClick={() => onMode("prompt")}>
            Prompt
          </ModeButton>
          <ModeButton selected={!promptMode} onClick={() => onMode("natural")}>
            Natural language
          </ModeButton>
        </div>
        <div
          className={
            open
              ? "rounded-[28px] border border-neutral-200 bg-white p-3 shadow-[0_16px_50px_rgba(0,0,0,0.06)]"
              : ""
          }
        >
          <form
            className={`flex items-end gap-2 bg-white p-2 ${
              open
                ? "rounded-2xl border border-neutral-200"
                : "rounded-2xl border border-neutral-200 shadow-[0_8px_30px_rgba(0,0,0,0.05)]"
            }`}
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
          >
            {recording ? (
              <VoiceBar
                onCancel={() => setRecording(false)}
                onConfirm={(transcript) => {
                  setRecording(false);
                  if (!transcript) {
                    setVoiceNote("No speech picked up.");
                    return;
                  }
                  setVoiceNote("");
                  setDraft((current) => (current.trim() ? `${current.trim()} ${transcript}` : transcript));
                }}
                onError={(message) => {
                  setRecording(false);
                  setVoiceNote(message);
                }}
              />
            ) : (
              <>
                <label htmlFor="prompt" className="sr-only">
                  {asking ? "Your answer" : promptMode ? promptPlaceholder : "Describe what you're building"}
                </label>
                <textarea
                  id="prompt"
                  ref={field}
                  rows={1}
                  value={draft}
                  placeholder={
                    asking
                      ? "Or type your own answer..."
                      : promptMode
                        ? promptPlaceholder
                        : "Describe what you're building..."
                  }
                  className="max-h-56 min-h-12 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-base leading-7 outline-none placeholder:text-neutral-400"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      send(draft);
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label="Dictate"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100"
                  onClick={() => {
                    setVoiceNote("");
                    setRecording(true);
                  }}
                >
                  <MicIcon />
                </button>
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={!draft.trim() || pending}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black text-white hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400"
                >
                  <ArrowUpIcon />
                </button>
              </>
            )}
          </form>
          {voiceNote ? (
            <p className="px-4 pt-3 text-sm text-neutral-500" aria-live="polite">
              {voiceNote}
            </p>
          ) : null}
          {open ? (
            <div className="mt-4 flex flex-col gap-5 px-2 pb-2">
              {items.map((item) => (
                <div key={item.id} data-turn="">
                  {item.kind === "user" ? (
                    <div className="flex justify-end">
                      <p className="max-w-[min(36rem,88%)] rounded-[20px] bg-[#e7eef8] px-4 py-3 text-[15px] leading-6 text-[#1c2834]">
                        {item.text}
                      </p>
                    </div>
                  ) : null}
                  {item.kind === "note" ? (
                    <p className="max-w-[40rem] text-[15px] leading-7 text-neutral-700">{item.text}</p>
                  ) : null}
                  {item.kind === "ask" ? (
                    <QuestionCard item={item} onPick={(choice) => reply(item.id, choice)} />
                  ) : null}
                  {item.kind === "estimate" && item.phase === "searching" ? (
                    <p className="text-[15px] text-neutral-400" aria-live="polite">
                      Searching other cases...
                    </p>
                  ) : null}
                  {item.kind === "estimate" && item.phase === "done" ? (
                    <div className="flex flex-col gap-4">
                      <p className="max-w-[40rem] text-[15px] leading-7">{item.prose}</p>
                      {item.answer ? <SolutionDiagram answer={item.answer} /> : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {promptMode || asking ? null : (
          <div className="mx-auto mt-4 flex max-w-xl flex-wrap justify-center gap-2">
            {developerStarters.map((starter) => (
              <button
                key={starter.id}
                type="button"
                className="rounded-full border border-neutral-200 px-4 py-2 text-left text-sm hover:border-black hover:bg-neutral-50"
                onClick={() => send(starter.prompt)}
              >
                {starter.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function QuestionCard({
  item,
  onPick,
}: {
  item: Extract<ThreadItem, { kind: "ask" }>;
  onPick: (choice: ClarifyChoice) => void;
}) {
  return (
    <div className="max-w-[40rem] rounded-2xl border border-neutral-200 px-4 py-4">
      <p className="text-xs font-medium text-neutral-400">
        {item.step} of {item.total}
      </p>
      <p className="mt-1 text-[15px] font-medium">{item.question.ask}</p>
      <div className="mt-3 flex flex-col gap-2">
        {item.question.choices.map((choice, index) => {
          const selected = item.picked === choice.label;
          return (
            <button
              key={choice.label}
              type="button"
              disabled={item.locked}
              onClick={() => onPick(choice)}
              className={`rounded-xl border px-3 py-2 text-left text-sm ${
                selected
                  ? "border-black bg-neutral-50"
                  : "border-neutral-200 hover:border-black disabled:hover:border-neutral-200"
              } disabled:cursor-default`}
            >
              <span className="mr-2 text-neutral-400">{index + 1}</span>
              {choice.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModeButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`rounded-full px-5 py-2 text-sm font-medium ${
        selected ? "bg-black text-white" : "text-neutral-500 hover:text-neutral-800"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 11a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V6M12 6l-6 6M12 6l6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const MIN_SEARCH_MS = 5200;

async function settleChart(prompt: string, answers: string[], fallback: DemoAnswer) {
  const started = Date.now();
  const chart = await requestChart(prompt, answers);
  const remain = MIN_SEARCH_MS - (Date.now() - started);
  if (remain > 0) await wait(remain);
  return chart ?? fallback;
}

async function requestChart(prompt: string, answers: string[]): Promise<DemoAnswer | null> {
  try {
    const response = await fetch("/api/chart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, answers }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as DemoAnswer;
    if (!Array.isArray(body.models) || body.models.length < 4) return null;
    if (!Array.isArray(body.optimizations) || body.optimizations.length < 4) return null;
    if (typeof body.prose !== "string" || !body.prose.trim()) return null;
    return body;
  } catch {
    return null;
  }
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
