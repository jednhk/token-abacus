"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot";
import { UsageChart } from "@/components/usage-chart";
import {
  questionsFor,
  shapeEstimate,
  type ClarifyChoice,
  type ClarifyPick,
  type ClarifyQuestion,
} from "@/lib/clarify";
import { formatTokens } from "@/lib/format";
import { type DemoAnswer, type SolutionPoint } from "@/lib/demo-answer";

type ChatItem =
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

type RecentChat = {
  prompt: string;
  title: string;
};

const RECENTS_KEY = "abacus-chats";

export function ChatWindow({ prompt }: { prompt: string }) {
  const opening = prompt.trim();
  const [items, setItems] = useState<ChatItem[]>(() => (opening ? openingThread(opening) : []));
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [recents, setRecents] = useState<RecentChat[]>([]);
  const [navOpen, setNavOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const topic = useRef(opening);
  const plan = useRef<ClarifyQuestion[]>(opening ? questionsFor(opening) : []);
  const picks = useRef<ClarifyPick[]>([]);
  const busy = useRef(false);

  useEffect(() => {
    if (opening) setRecents(remember(opening));
    else setRecents(readRecents());
  }, [opening]);

  useEffect(() => {
    const latest = thread.current?.querySelector("[data-turn]:last-of-type");
    latest?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [items]);

  function reply(askId: string, choice: ClarifyChoice) {
    if (pending || busy.current) return;
    busy.current = true;
    const ask = items.find((item) => item.id === askId && item.kind === "ask" && !item.locked);
    if (!ask || ask.kind !== "ask") {
      busy.current = false;
      return;
    }
    picks.current = [...picks.current, { ask: ask.question.ask, label: choice.label, weight: choice.weight }];
    const nextStep = ask.step + 1;
    const estimateId = crypto.randomUUID();
    setItems((current) => {
      const locked = current.map((item) =>
        item.id === askId && item.kind === "ask"
          ? { ...item, locked: true, picked: choice.label }
          : item,
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
    setDraft("");
    setVoiceOpen(false);
    if (nextStep > ask.total) {
      const ticket = ++request.current;
      setPending(true);
      void finish(estimateId, ticket);
      return;
    }
    busy.current = false;
  }

  async function finish(id: string, ticket: number) {
    const answer = shapeEstimate(topic.current, picks.current);
    await wait(900);
    if (request.current !== ticket) return;
    setItems((current) =>
      current.map((item) =>
        item.id === id && item.kind === "estimate"
          ? { ...item, phase: "done", prose: answer.prose, answer }
          : item,
      ),
    );
    setPending(false);
    busy.current = false;
  }

  function beginTopic(text: string) {
    topic.current = text;
    plan.current = questionsFor(text);
    picks.current = [];
    const questions = plan.current;
    setItems((current) => [
      ...current,
      { id: crypto.randomUUID(), kind: "user", text },
      {
        id: crypto.randomUUID(),
        kind: "note",
        text: "A few questions first. An estimate before that would be a guess.",
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
    setDraft("");
    setVoiceOpen(false);
    setRecents(remember(text));
  }

  function send(text: string) {
    const value = text.trim();
    if (!value || pending) return;
    const open = [...items].reverse().find((item) => item.kind === "ask" && !item.locked);
    if (open && open.kind === "ask") {
      reply(open.id, { label: value, weight: 1 });
      return;
    }
    beginTopic(value);
  }

  const title = opening || "New chat";
  const asking = items.some((item) => item.kind === "ask" && !item.locked);

  return (
    <div className="flex h-dvh bg-white text-neutral-950">
      {navOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <Sidebar
        recents={recents}
        active={opening}
        open={navOpen}
        onNavigate={() => setNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 px-3">
          <button
            type="button"
            aria-label="Open sidebar"
            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-neutral-100 md:hidden"
            onClick={() => setNavOpen(true)}
          >
            <MenuIcon />
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sm text-neutral-700">
            {title}
          </p>
          <span className="w-9 md:hidden" />
        </header>

        <div ref={thread} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-6 sm:px-6">
            {items.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <h1 className="text-center text-2xl font-medium tracking-tight text-neutral-800">
                  What are you building?
                </h1>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
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
            )}
          </div>
        </div>

        <form
          className="mx-auto w-full max-w-3xl px-4 pt-2 pb-4 sm:px-6"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <div className="rounded-[28px] border border-neutral-200 bg-white px-4 pt-3 pb-2 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
            <label htmlFor="chat-prompt" className="sr-only">
              Describe what you&apos;re building
            </label>
            <textarea
              id="chat-prompt"
              rows={2}
              value={draft}
              placeholder={asking ? "Or type your own answer..." : "Describe what you're building..."}
              className="max-h-40 min-h-12 w-full resize-none bg-transparent py-1 text-base leading-6 outline-none placeholder:text-neutral-400"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(draft);
                }
              }}
            />
            <div className="flex items-center justify-end gap-1 pb-1">
              <button
                type="button"
                aria-label="Start a voice call"
                aria-pressed={voiceOpen}
                className="grid h-9 w-9 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100"
                onClick={() => setVoiceOpen((open) => !open)}
              >
                <MicIcon />
              </button>
              <button
                type="submit"
                aria-label="Send"
                disabled={!draft.trim() || pending}
                className="grid h-9 w-9 place-items-center rounded-full bg-black text-white hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400"
              >
                <ArrowUpIcon />
              </button>
            </div>
          </div>
          {voiceOpen ? (
            <p className="px-2 pt-2 text-sm text-neutral-500" aria-live="polite">
              Voice calls are coming soon.
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

function Sidebar({
  recents,
  active,
  open,
  onNavigate,
}: {
  recents: RecentChat[];
  active: string;
  open: boolean;
  onNavigate: () => void;
}) {
  return (
    <aside
      className={`${
        open ? "flex" : "hidden"
      } fixed inset-y-0 left-0 z-40 w-[260px] shrink-0 flex-col bg-[#f4f4f5] px-2 py-3 md:static md:flex`}
    >
      <Link
        href="/"
        className="mx-1 flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/5"
        onClick={onNavigate}
      >
        <Mascot className="h-7 w-auto" />
        <span className="text-[15px] font-semibold tracking-tight">Abacus</span>
      </Link>
      <Link
        href="/chat"
        className="mx-1 mt-2 flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-black/5"
        onClick={onNavigate}
      >
        <ComposeIcon />
        New chat
      </Link>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-1">
        {recents.length > 0 ? (
          <>
            <p className="px-2 pb-1 text-xs text-neutral-500">Recents</p>
            <ul className="flex flex-col">
              {recents.map((item) => {
                const current = item.prompt === active;
                return (
                  <li key={item.prompt}>
                    <Link
                      href={`/chat?prompt=${encodeURIComponent(item.prompt)}`}
                      aria-current={current ? "page" : undefined}
                      className={`block truncate rounded-lg px-2 py-2 text-sm ${
                        current ? "bg-white text-neutral-950" : "text-neutral-700 hover:bg-black/5"
                      }`}
                      onClick={onNavigate}
                    >
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </div>
    </aside>
  );
}

function SolutionDiagram({ answer }: { answer: DemoAnswer }) {
  const leanModel = recommended(answer.models);
  const heavyModel = heaviest(answer.models);
  const leanSetup = recommended(answer.optimizations);

  return (
    <section className="rounded-[28px] border border-neutral-200 bg-white px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium">Average tokens</h2>
        <p className="text-xs text-neutral-400">Mock · this task</p>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
        Mock sketch. {leanModel.name} is the lean model at {formatTokens(total(leanModel))}.{" "}
        {heavyModel.name} is the heavy one at {formatTokens(total(heavyModel))}. {leanSetup.name}{" "}
        is the leaner setup at {formatTokens(total(leanSetup))}.
      </p>
      <dl className="mt-5 grid gap-2 sm:grid-cols-3">
        <Stat label="Lean model" value={`${leanModel.name} · ${formatTokens(total(leanModel))}`} />
        <Stat label="Lean setup" value={`${leanSetup.name} · ${formatTokens(total(leanSetup))}`} />
        <Stat
          label="Heaviest model"
          value={`${heavyModel.name} · ${formatTokens(total(heavyModel))}`}
        />
      </dl>
      <div className="mt-8 flex flex-col gap-10">
        <UsageChart title="By model" accent="#5b4ce0" points={answer.models} />
        <UsageChart title="By optimization" accent="#f08a24" points={answer.optimizations} />
      </div>
      <p className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
        <i
          className="h-3.5 w-3.5 rounded-[3px]"
          style={{
            backgroundColor: "#1f8a42",
            backgroundImage:
              "linear-gradient(45deg, #7dcea0 25%, transparent 25%, transparent 50%, #7dcea0 50%, #7dcea0 75%, transparent 75%)",
            backgroundSize: "6px 6px",
          }}
        />
        Checked bar is the lean path
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-neutral-50 px-3 py-3">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function recommended(points: SolutionPoint[]) {
  return points.find((point) => point.recommended) ?? points[0];
}

function heaviest(points: SolutionPoint[]) {
  return points.reduce((best, point) => (total(point) > total(best) ? point : best));
}

function total(point: SolutionPoint) {
  return point.input + point.output;
}

function readRecents(): RecentChat[] {
  try {
    const raw = sessionStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is RecentChat =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as RecentChat).prompt === "string" &&
          typeof (item as RecentChat).title === "string",
      )
      .slice(0, 16);
  } catch {
    return [];
  }
}

function remember(prompt: string) {
  const clean = prompt.replace(/\s+/g, " ").trim();
  const title = clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
  const next = [{ prompt: clean, title }, ...readRecents().filter((item) => item.prompt !== clean)].slice(
    0,
    16,
  );
  sessionStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  return next;
}

function openingThread(prompt: string): ChatItem[] {
  const questions = questionsFor(prompt);
  return [
    { id: "opening-user", kind: "user", text: prompt },
    {
      id: "opening-note",
      kind: "note",
      text: "A few questions first. An estimate before that would be a guess.",
    },
    {
      id: "opening-q",
      kind: "ask",
      question: questions[0],
      step: 1,
      total: questions.length,
      locked: false,
    },
  ];
}

function QuestionCard({
  item,
  onPick,
}: {
  item: Extract<ChatItem, { kind: "ask" }>;
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

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ComposeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4l10-10-4-4L4 16v4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M13 7l4 4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
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
