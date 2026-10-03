"use client";

import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot";
import { developerStarters, type Reply } from "@/lib/content";
import { resolveReply } from "@/lib/estimate";
import { formatTokens as compactTokens, formatUsd } from "@/lib/format";

type Message = {
  id: string;
  role: "user" | "assistant";
  text?: string;
  reply?: Reply;
};

function formatTokens(value: number) {
  return value.toLocaleString("en-US");
}

export function HomeStudio() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    if (window.location.hash !== "#workspace") return;
    document.getElementById("workspace")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  function resetThread() {
    request.current += 1;
    setMessages([]);
    setDraft("");
    setPending(false);
    setVoiceOpen(false);
  }

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || pending) return;
    const ticket = ++request.current;

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: prompt },
    ]);
    setDraft("");
    setVoiceOpen(false);
    setPending(true);
    const reply = await resolveReply(prompt);
    if (request.current !== ticket) return;
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "assistant", reply },
    ]);
    setPending(false);
  }

  return (
    <section
      id="workspace"
      className="scroll-mt-24 px-4 pb-4 sm:px-6"
      aria-labelledby="workspace-title"
    >
      <h2 id="workspace-title" className="sr-only">
        Estimate
      </h2>
      <div className="mx-auto flex max-w-3xl flex-col">
        {messages.length > 0 ? (
          <div className="flex flex-col gap-6 pb-6">
            <div className="flex justify-end">
              <button
                type="button"
                className="text-sm font-medium underline decoration-neutral-300 underline-offset-4 hover:decoration-black"
                onClick={resetThread}
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
                    <ReplyCard reply={message.reply!} />
                  </li>
                ),
              )}
              {pending ? (
                <li className="flex items-start gap-3">
                  <Mascot className="mt-0.5 h-9 w-auto shrink-0" />
                  <p className="pt-2 text-[15px] text-neutral-500">
                    Looking for similar tasks…
                  </p>
                </li>
              ) : null}
            </ol>
          </div>
        ) : null}

        <form
          className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white py-1.5 pr-1.5 pl-5 shadow-[0_8px_30px_rgba(0,0,0,0.05)]"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <label htmlFor="prompt" className="sr-only">
            Describe what you're building
          </label>
          <textarea
            id="prompt"
            rows={1}
            value={draft}
            placeholder="Describe what you're building..."
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 outline-none placeholder:text-neutral-400"
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
            aria-label="Start a voice call"
            aria-pressed={voiceOpen}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100"
            onClick={() => setVoiceOpen((open) => !open)}
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
        </form>
        {voiceOpen ? (
          <p className="px-4 pt-3 text-sm text-neutral-500" aria-live="polite">
            Voice calls are coming soon.
          </p>
        ) : null}
        {messages.length === 0 ? (
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
        ) : null}
      </div>
    </section>
  );
}

function ReplyCard({ reply }: { reply: Reply }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-medium tracking-wide text-neutral-400 uppercase">
        {reply.live ? "From similar tasks" : "Preview until similar tasks are recorded"}
      </p>
      <p className="mt-2 text-[15px] leading-6">{reply.summary}</p>
      <p className="mt-3 text-[15px] leading-6">{reply.recommendation}</p>
      {reply.lines.length > 0 ? (
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
      ) : null}
      {reply.similar && reply.similar.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium tracking-wide text-neutral-400 uppercase">
            Based on tasks like
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {reply.similar.slice(0, 3).map((task) => (
              <li key={`${task.title}-${task.model}`} className="text-sm leading-5">
                <span className="font-medium">{task.title}</span>
                <span className="text-neutral-500">
                  {" "}
                  · {task.model} · {compactTokens(task.total_tokens)} ·{" "}
                  {formatUsd(task.cost_usd)}
                </span>
              </li>
            ))}
          </ul>
        </div>
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
