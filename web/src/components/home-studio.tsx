"use client";

import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot";
import { SolutionDiagram } from "@/components/solution-diagram";
import { CostBreakdown } from "@/components/cost-breakdown";
import { VoiceOrb } from "@/components/voice-orb";
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
import type { Breakdown } from "@/lib/breakdown";
import { useLiveAgent, type Caption } from "@/lib/use-live-agent";

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
    }
  | { id: string; kind: "breakdown"; phase: "searching" | "done"; result?: Breakdown };

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
  const searching = items.some(
    (item) => (item.kind === "estimate" || item.kind === "breakdown") && item.phase === "searching",
  );
  const latestDone = [...items]
    .reverse()
    .find((item) => (item.kind === "estimate" || item.kind === "breakdown") && item.phase === "done");
  const open = items.length > 0;
  const agent = useLiveAgent(voiceTask);
  const note = voiceNote || agent.note;

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
  }, [draft, open]);

  useEffect(() => {
    const latest = document.querySelector("[data-turn]:last-of-type");
    latest?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [items]);

  useEffect(() => {
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
    if (request.current[lane] !== ticket) return null;
    updateThread(lane, (current) =>
      current.map((item) =>
        item.id === id && item.kind === "estimate"
          ? { ...item, phase: "done", prose: answer.prose, answer }
          : item,
      ),
    );
    setPending(lane, false);
    return answer;
  }

  // The voice agent scopes the task out loud and splits it into subtasks; each
  // subtask is priced from recorded runs and the breakdown goes on screen.
  async function voiceTask(args: Record<string, unknown>) {
    const lane = mode;
    const task = String(args.task ?? "").trim();
    if (!task) return "No task was given. Ask them what they want to build.";
    if (pendingMode[lane]) return "Another estimate is still running. Ask them to wait a moment.";
    const id = crypto.randomUUID();
    updateThread(lane, (current) => [
      ...current.map((item) => (item.kind === "ask" ? { ...item, locked: true } : item)),
      { id: crypto.randomUUID(), kind: "user", text: task },
      { id, kind: "breakdown", phase: "searching" },
    ]);
    const ticket = ++request.current[lane];
    setPending(lane, true);
    busy.current = false;
    const result = await requestBreakdown(task, args.models, args.subtasks);
    if (request.current[lane] !== ticket) return "That estimate was replaced by a newer one.";
    updateThread(lane, (current) =>
      current.map((item) => (item.id === id && item.kind === "breakdown" ? { ...item, phase: "done", result: result ?? undefined } : item)),
    );
    setPending(lane, false);
    if (!result) return "The price lookup failed. Say sorry and offer to try again.";
    return {
      say: result.summary,
      total_usd: result.total_usd,
      up_to_usd: result.total_high_usd,
      subtasks_priced: `${result.priced} of ${result.subtasks.length}`,
      subtasks: result.subtasks.map((row) => ({
        title: row.title,
        usd: row.usd,
        model: row.model,
        similar_recorded_tasks: row.similar,
        from_a_model_they_did_not_list: row.outside,
      })),
    };
  }

  async function talk() {
    if (agent.active) {
      agent.stop();
      return;
    }
    setVoiceNote("");
    if ((await agent.start()) === "unavailable") {
      setVoiceNote("Voice isn't switched on here yet. Type your task below.");
    }
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
    <section
      id="workspace"
      className={`scroll-mt-24 px-4 pb-4 sm:px-6 ${open ? "pt-8" : ""}`}
      aria-labelledby="workspace-title"
    >
      <h2 id="workspace-title" className="sr-only">
        Estimate
      </h2>
      <div className="mx-auto flex max-w-3xl flex-col">
        {open ? null : (
          <div className="pt-10 text-center sm:pt-14">
            <h1 className="mx-auto max-w-[16ch] font-serif text-[2.6rem] leading-[0.98] font-medium tracking-[-0.03em] sm:text-6xl md:text-[4.25rem]">
              Meet Abacus, your token saver.
            </h1>
            <p className="mx-auto mt-5 max-w-md text-balance text-base leading-7 text-neutral-500 sm:text-lg">
              See the cost before you send it, then take the cheaper path.
            </p>
            <button
              type="button"
              aria-label={agent.active ? "End the voice conversation" : "Talk to Abacus"}
              aria-pressed={agent.active}
              className="mx-auto mt-6 block rounded-full outline-offset-4 focus-visible:outline-2 focus-visible:outline-black"
              onClick={() => void talk()}
            >
              <VoiceOrb size={220} state={agent.state} levels={agent.levels} />
            </button>
            <VoiceCaption state={agent.state} caption={agent.caption} idle="Tap the orb and say what you're building" />
          </div>
        )}
        {open ? null : (
          <div
            role="radiogroup"
            aria-label="Input type"
            className="mx-auto mt-8 mb-4 inline-flex items-center rounded-full bg-neutral-100 p-1"
          >
            <ModeButton selected={promptMode} onClick={() => onMode("prompt")}>
              Prompt
            </ModeButton>
            <ModeButton selected={!promptMode} onClick={() => onMode("natural")}>
              Natural language
            </ModeButton>
          </div>
        )}
        <div
          className={
            open
              ? "rounded-[28px] border border-neutral-200 bg-white p-3 shadow-[0_16px_50px_rgba(0,0,0,0.06)]"
              : ""
          }
        >
          {open && agent.active ? (
            <div className="mb-3 flex items-center gap-3 rounded-2xl bg-neutral-50 px-3 py-2">
              <VoiceOrb size={56} state={agent.state} levels={agent.levels} className="shrink-0" />
              <div className="min-w-0 flex-1 text-left">
                <VoiceCaption state={agent.state} caption={agent.caption} idle="" compact />
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:border-black"
                onClick={agent.stop}
              >
                End
              </button>
            </div>
          ) : null}
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
                  aria-label={agent.active ? "End the voice conversation" : "Talk to Abacus"}
                  aria-pressed={agent.active}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                    agent.active ? "bg-black text-white" : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                  onClick={() => void talk()}
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
          </form>
          {note ? (
            <p className="px-4 pt-3 text-sm text-neutral-500" aria-live="polite">
              {note}
            </p>
          ) : null}
          {open ? (
            <div className="mt-4 px-2 pb-2">
              {searching ? (
                <LoadingLook />
              ) : asking ? (
                <div className="flex flex-col gap-5">
                  {items.map((item) =>
                    item.kind === "user" ? (
                      <div key={item.id} data-turn="" className="flex justify-end">
                        <p className="max-w-[min(36rem,88%)] rounded-[20px] bg-[#e7eef8] px-4 py-3 text-[15px] leading-6 text-[#1c2834]">
                          {item.text}
                        </p>
                      </div>
                    ) : item.kind === "note" ? (
                      <p key={item.id} data-turn="" className="max-w-[40rem] text-[15px] leading-7 text-neutral-700">
                        {item.text}
                      </p>
                    ) : item.kind === "ask" ? (
                      <div key={item.id} data-turn="">
                        <QuestionCard item={item} onPick={(choice) => reply(item.id, choice)} />
                      </div>
                    ) : null,
                  )}
                </div>
              ) : latestDone?.kind === "breakdown" ? (
                <div data-turn="">
                  {latestDone.result ? (
                    <CostBreakdown breakdown={latestDone.result} />
                  ) : (
                    <p className="text-[15px] text-neutral-500">Couldn&apos;t reach the price data. Try again in a moment.</p>
                  )}
                </div>
              ) : latestDone?.kind === "estimate" && latestDone.answer ? (
                <div data-turn="">
                  <SolutionDiagram answer={latestDone.answer} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {open || promptMode || asking ? null : (
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

const REFERENCE_COUNT = 158;

// The live model occasionally leaks a code block into its transcript; it isn't speech, so hide it.
function spoken(text: string) {
  return text.replace(/```[\s\S]*?(```|$)/g, "").replace(/\s+/g, " ").trim();
}


function VoiceCaption({
  state,
  caption,
  idle,
  compact = false,
}: {
  state: "idle" | "connecting" | "live" | "thinking";
  caption: Caption | null;
  idle: string;
  compact?: boolean;
}) {
  const text =
    state === "idle"
      ? idle
      : state === "connecting"
        ? "Connecting..."
        : state === "thinking"
          ? "Pricing it against past runs..."
          : caption
            ? spoken(caption.text)
            : "Listening...";
  const who = state === "live" && caption ? (caption.who === "you" ? "You" : "Abacus") : "";
  return (
    <p
      aria-live="polite"
      className={`${compact ? "truncate text-sm" : "mx-auto mt-3 line-clamp-2 min-h-12 max-w-md text-[15px] leading-6"} text-neutral-500`}
    >
      {who ? <span className="mr-1.5 font-medium text-neutral-900">{who}</span> : null}
      {text}
    </p>
  );
}

function LoadingLook() {
  return (
    <div data-turn="" className="flex flex-col items-center gap-5 px-4 py-10 text-center">
      <div className="animate-[abacus-spin_8s_linear_infinite]">
        <Mascot className="h-24 w-auto" />
      </div>
      <p className="text-[15px] text-neutral-500" aria-live="polite">
        Looking at {REFERENCE_COUNT} other prompts / references
      </p>
    </div>
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

async function requestBreakdown(task: string, models: unknown, subtasks: unknown): Promise<Breakdown | null> {
  try {
    const response = await fetch("/api/voice-estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task, models, subtasks }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Breakdown;
    return Array.isArray(body.subtasks) ? body : null;
  } catch {
    return null;
  }
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
