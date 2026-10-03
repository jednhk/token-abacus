"use client";

import { useEffect, useState } from "react";
import { Mascot } from "@/components/mascot";
import {
  agentStarters,
  buildReply,
  developerStarters,
  type Mode,
  type Reply,
} from "@/lib/content";

type Message = {
  id: string;
  role: "user" | "assistant";
  text?: string;
  reply?: Reply;
};

const copy: Record<
  Mode,
  { title: string; hint: string; placeholder: string }
> = {
  developer: {
    title: "What are you building?",
    hint: "Abacus counts the tokens and suggests a leaner way to ask.",
    placeholder: "Describe what you're building...",
  },
  agent: {
    title: "What should your agent spend?",
    hint: "Pick a workflow. Abacus estimates the tokens and a cheaper setup.",
    placeholder: "Describe the agent task...",
  },
};

function formatTokens(value: number) {
  return value.toLocaleString("en-US");
}

export function HomeStudio() {
  const [mode, setMode] = useState<Mode>("developer");
  const [draft, setDraft] = useState("");
  const [budget, setBudget] = useState("10000");
  const [messages, setMessages] = useState<Message[]>([]);
  const [voiceOpen, setVoiceOpen] = useState(false);

  useEffect(() => {
    if (window.location.hash !== "#workspace") return;
    document.getElementById("workspace")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const active = copy[mode];
  const budgetValue = Number(budget);
  const hasBudget = Number.isFinite(budgetValue) && budgetValue > 0;

  function switchMode(next: Mode) {
    setMode(next);
    setMessages([]);
    setDraft("");
    setVoiceOpen(false);
  }

  function send(text: string) {
    const prompt = text.trim();
    if (!prompt) return;

    const reply = buildReply(mode, prompt);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: prompt },
      { id: crypto.randomUUID(), role: "assistant", reply },
    ]);
    setDraft("");
    setVoiceOpen(false);
  }

  return (
    <section
      id="workspace"
      className="scroll-mt-24 px-4 pb-4 sm:px-6"
      aria-labelledby="workspace-title"
    >
      <div className="mx-auto flex max-w-3xl flex-col">
        <div
          className="mx-auto inline-flex rounded-full bg-neutral-100 p-1"
          role="tablist"
          aria-label="Who this estimate is for"
        >
          {(
            [
              ["developer", "Developer"],
              ["agent", "Agents"],
            ] as const
          ).map(([value, label]) => {
            const selected = mode === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                id={`tab-${value}`}
                aria-selected={selected}
                aria-controls="workspace-panel"
                className={`min-w-[7.25rem] rounded-full px-4 py-2.5 text-[15px] font-medium transition-colors ${
                  selected
                    ? "bg-black text-white"
                    : "text-neutral-500 hover:text-black"
                }`}
                onClick={() => switchMode(value)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div
          id="workspace-panel"
          role="tabpanel"
          aria-labelledby={`tab-${mode}`}
          className="mt-8 flex flex-col"
        >
          {messages.length === 0 ? (
            <div className="px-1 pb-8 text-center sm:pb-10">
              <h2
                id="workspace-title"
                className="font-serif text-[2rem] leading-none tracking-tight sm:text-[2.75rem]"
              >
                {active.title}
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-balance text-[15px] leading-6 text-neutral-500">
                {active.hint}
              </p>

              {mode === "developer" ? (
                <div className="mx-auto mt-6 flex max-w-xl flex-wrap justify-center gap-2">
                  {developerStarters.map((starter) => (
                    <button
                      key={starter.id}
                      type="button"
                      className="rounded-full border border-neutral-200 px-4 py-2.5 text-left text-sm hover:border-black hover:bg-neutral-50"
                      onClick={() => send(starter.prompt)}
                    >
                      {starter.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
                  {agentStarters.map((starter) => (
                    <button
                      key={starter.id}
                      type="button"
                      className="rounded-2xl border border-neutral-200 px-4 py-4 hover:border-black hover:bg-neutral-50"
                      onClick={() => send(starter.prompt)}
                    >
                      <span className="text-xs font-medium tracking-wide text-neutral-400 uppercase">
                        {starter.area}
                      </span>
                      <span className="mt-1.5 block text-[15px] leading-6">
                        {starter.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-6 pb-6">
              <div className="flex items-center justify-between gap-3">
                <h2 id="workspace-title" className="text-sm text-neutral-500">
                  {mode === "developer" ? "Developer" : "Agents"}
                </h2>
                <button
                  type="button"
                  className="text-sm font-medium underline decoration-neutral-300 underline-offset-4 hover:decoration-black"
                  onClick={() => setMessages([])}
                >
                  Start over
                </button>
              </div>
              <ol className="flex flex-col gap-6">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <li key={message.id} className="flex justify-end">
                      <p className="max-w-[85%] rounded-3xl bg-black px-4 py-3 text-[15px] leading-6 text-white">
                        {message.text}
                      </p>
                    </li>
                  ) : (
                    <li key={message.id} className="flex items-start gap-3">
                      <Mascot className="mt-0.5 h-9 w-auto shrink-0" />
                      <ReplyCard
                        reply={message.reply!}
                        budget={hasBudget ? budgetValue : null}
                      />
                    </li>
                  ),
                )}
              </ol>
            </div>
          )}

          <form
            className="rounded-[28px] border border-neutral-200 bg-white p-3 shadow-[0_10px_40px_rgba(0,0,0,0.05)]"
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
          >
            <label htmlFor="prompt" className="sr-only">
              {active.placeholder}
            </label>
            <textarea
              id="prompt"
              rows={2}
              value={draft}
              placeholder={active.placeholder}
              className="max-h-40 w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-neutral-400"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(draft);
                }
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1">
              <label className="flex items-center gap-2 text-sm text-neutral-500">
                Budget
                <input
                  inputMode="numeric"
                  value={budget}
                  aria-label="Token budget"
                  className="w-24 rounded-full border border-neutral-200 px-3 py-1.5 text-base text-black tabular-nums outline-none focus:border-black"
                  onChange={(event) =>
                    setBudget(event.target.value.replace(/[^\d]/g, ""))
                  }
                />
                <span>tokens</span>
              </label>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Start a voice call"
                  aria-pressed={voiceOpen}
                  className="grid h-11 w-11 place-items-center rounded-full border border-neutral-200 hover:border-black"
                  onClick={() => setVoiceOpen((open) => !open)}
                >
                  <MicIcon />
                </button>
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={!draft.trim()}
                  className="grid h-11 w-11 place-items-center rounded-full bg-black text-white hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400"
                >
                  <ArrowUpIcon />
                </button>
              </div>
            </div>
            {voiceOpen ? (
              <p className="px-2 pt-3 text-sm text-neutral-500" aria-live="polite">
                Voice calls are coming soon.
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}

function ReplyCard({
  reply,
  budget,
}: {
  reply: Reply;
  budget: number | null;
}) {
  const delta = budget === null ? null : reply.suggested - budget;

  return (
    <div className="min-w-0 flex-1">
      <p className="text-[15px] leading-6">{reply.summary}</p>
      <p className="mt-3 text-[15px] leading-6">{reply.recommendation}</p>
      <dl className="mt-4 border-y border-neutral-200">
        {reply.lines.map((line) => (
          <div
            key={line.label}
            className="flex items-baseline justify-between gap-4 border-b border-neutral-100 py-2.5 text-sm last:border-0"
          >
            <dt className="text-neutral-500">{line.label}</dt>
            <dd className="shrink-0 tabular-nums">
              {formatTokens(line.tokens)}
            </dd>
          </div>
        ))}
      </dl>
      {delta !== null ? (
        <p className="mt-3 text-sm font-medium">
          {delta <= 0
            ? `Within a ${formatTokens(budget!)} token budget.`
            : `${formatTokens(delta)} tokens over a ${formatTokens(budget!)} budget.`}
        </p>
      ) : null}
    </div>
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
      <path d="M12 19V6M12 6l-6 6M12 6l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
