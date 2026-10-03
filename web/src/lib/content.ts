export type Mode = "developer" | "agent";

export type ReplyLine = {
  label: string;
  tokens: number;
};

export type Reply = {
  summary: string;
  recommendation: string;
  lines: ReplyLine[];
  suggested: number;
};

export type Starter = {
  id: string;
  area?: string;
  label: string;
  prompt: string;
};

export const developerStarters: Starter[] = [
  {
    id: "cost",
    label: "How many tokens will this cost?",
    prompt: "How many tokens will this cost?",
  },
  {
    id: "model",
    label: "Which model is cheaper for this?",
    prompt: "Which model is cheaper for this?",
  },
  {
    id: "trim",
    label: "Trim this so it still works",
    prompt: "Trim this so it still works",
  },
  {
    id: "split",
    label: "Split this into a cheap first pass",
    prompt: "Split this into a cheap first pass",
  },
];

export const agentStarters: Starter[] = [
  {
    id: "spend",
    area: "Spend",
    label: "Estimate what this agent run will cost",
    prompt: "Estimate what this agent run will cost",
  },
  {
    id: "model",
    area: "Model",
    label: "Pick the cheapest model that still ships this",
    prompt: "Pick the cheapest model that still ships this",
  },
  {
    id: "context",
    area: "Context",
    label: "Cut this agent's context without losing the task",
    prompt: "Cut this agent's context without losing the task",
  },
  {
    id: "stack",
    area: "Stack",
    label: "Recommend a setup that lowers my token bill",
    prompt: "Recommend a setup that lowers my token bill",
  },
  {
    id: "audit",
    area: "Audit",
    label: "Find where my agent is wasting tokens",
    prompt: "Find where my agent is wasting tokens",
  },
  {
    id: "plan",
    area: "Plan",
    label: "Set this week's token budget",
    prompt: "Set this week's token budget",
  },
];

const developerReplies: Record<string, Reply> = {
  "How many tokens will this cost?": {
    summary:
      "The task itself is small. The tokens pile up in the context pasted around it.",
    recommendation:
      "Send the question first, and only the files that answer depends on.",
    lines: [
      { label: "Task only", tokens: 220 },
      { label: "Typical attached context", tokens: 2400 },
      { label: "Lean version", tokens: 640 },
    ],
    suggested: 640,
  },
  "Which model is cheaper for this?": {
    summary:
      "A draft or a routing step does fine on a small model. Keep the larger model for the check.",
    recommendation:
      "Write the first pass on a small model, and escalate only if that pass misses.",
    lines: [
      { label: "Small-model draft", tokens: 260 },
      { label: "Large-model redo", tokens: 1100 },
      { label: "Suggested path", tokens: 420 },
    ],
    suggested: 420,
  },
  "Trim this so it still works": {
    summary:
      "Most prompts say the goal, the constraints, and the context twice.",
    recommendation:
      "Keep the goal and the constraints. Point at the context instead of pasting it.",
    lines: [
      { label: "Original prompt", tokens: 1800 },
      { label: "Repeated instructions", tokens: 700 },
      { label: "Trimmed prompt", tokens: 540 },
    ],
    suggested: 540,
  },
  "Split this into a cheap first pass": {
    summary:
      "One giant request spends tokens on planning and writing at the same time.",
    recommendation:
      "Ask for an outline first. Generate the full piece only for the parts you keep.",
    lines: [
      { label: "One-shot request", tokens: 2200 },
      { label: "Outline pass", tokens: 180 },
      { label: "Chosen section", tokens: 700 },
    ],
    suggested: 880,
  },
};

const agentReplies: Record<string, Reply> = {
  "Estimate what this agent run will cost": {
    summary:
      "A plan, a few tool calls, and a writeup usually land in the low thousands of tokens.",
    recommendation:
      "Cap the run at one plan and three tool calls before it writes.",
    lines: [
      { label: "Plan", tokens: 300 },
      { label: "Tool results", tokens: 1600 },
      { label: "Writeup", tokens: 500 },
      { label: "Uncapped loop", tokens: 6400 },
    ],
    suggested: 2400,
  },
  "Pick the cheapest model that still ships this": {
    summary:
      "Narrow steps like gathering and list-building do not need the largest model.",
    recommendation:
      "Use a small model to gather, and a larger one only to judge the shortlist.",
    lines: [
      { label: "All-large run", tokens: 4800 },
      { label: "Gather on a small model", tokens: 900 },
      { label: "Judge the shortlist", tokens: 600 },
    ],
    suggested: 1500,
  },
  "Cut this agent's context without losing the task": {
    summary:
      "The agent is rereading the brief, the last answer, and every tool result.",
    recommendation:
      "Keep the goal, the latest decision, and the one tool result in use.",
    lines: [
      { label: "Full thread", tokens: 8200 },
      { label: "Repeated brief", tokens: 2100 },
      { label: "Lean context", tokens: 1400 },
    ],
    suggested: 1400,
  },
  "Recommend a setup that lowers my token bill": {
    summary:
      "The lean setup is a cached instruction, a small model, and a short memory.",
    recommendation:
      "Cache the standing instructions, and store decisions outside the prompt.",
    lines: [
      { label: "Fresh instructions each run", tokens: 1200 },
      { label: "Cached instructions", tokens: 80 },
      { label: "Short memory", tokens: 400 },
    ],
    suggested: 480,
  },
  "Find where my agent is wasting tokens": {
    summary: "The waste is reread context, not the final answer.",
    recommendation:
      "Stop resending the system prompt and old tool output on every step.",
    lines: [
      { label: "Reread context", tokens: 3600 },
      { label: "Final answer", tokens: 420 },
      { label: "After the cut", tokens: 900 },
    ],
    suggested: 900,
  },
  "Set this week's token budget": {
    summary:
      "One agent, a few runs a day, can stay near 60,000 tokens this week.",
    recommendation:
      "Give each run a 4,000 token cap, and stop when the plan is done.",
    lines: [
      { label: "One lean run", tokens: 2400 },
      { label: "Five runs", tokens: 12000 },
      { label: "Week at this pace", tokens: 60000 },
    ],
    suggested: 2400,
  },
};

export function buildReply(mode: Mode, prompt: string): Reply {
  const scripted =
    mode === "developer" ? developerReplies[prompt] : agentReplies[prompt];
  if (scripted) return scripted;

  const words = Math.max(4, prompt.trim().split(/\s+/).filter(Boolean).length);
  const full = words * (mode === "agent" ? 90 : 40);
  const lean = Math.round(full * 0.42);

  return {
    summary:
      mode === "agent"
        ? `That agent task is about ${full.toLocaleString()} tokens if the run keeps its full context.`
        : `That request is about ${full.toLocaleString()} tokens once the surrounding context is included.`,
    recommendation:
      mode === "agent"
        ? "Narrow the run to one goal, one tool result, and a short writeup."
        : "Ask for the decision first, and attach only the context that decision needs.",
    lines: [
      { label: "Full version", tokens: full },
      { label: "Lean version", tokens: lean },
    ],
    suggested: lean,
  };
}

export type Setup = {
  name: string;
  bestFor: string;
  tokens: string;
  saves: string;
  updated: string;
};

export const setups: Setup[] = [
  {
    name: "Small model first",
    bestFor: "Drafts and routing",
    tokens: "260",
    saves: "61%",
    updated: "2 hours",
  },
  {
    name: "Trimmed context",
    bestFor: "Long docs and threads",
    tokens: "540",
    saves: "70%",
    updated: "5 hours",
  },
  {
    name: "Cached instructions",
    bestFor: "Repeated agent runs",
    tokens: "80",
    saves: "73%",
    updated: "1 day",
  },
  {
    name: "Outline, then write",
    bestFor: "Posts and updates",
    tokens: "880",
    saves: "60%",
    updated: "3 hours",
  },
  {
    name: "One tool result",
    bestFor: "Research agents",
    tokens: "1,400",
    saves: "83%",
    updated: "8 hours",
  },
];

export const benefits = [
  "Estimate a prompt before you send it",
  "Compare a lean path with the full one",
  "Cap what an agent can spend",
  "Pick a cheaper setup for the same task",
];
