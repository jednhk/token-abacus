export type ReplyLine = {
  label: string;
  tokens: number;
};

export type SimilarTask = {
  title: string;
  model: string;
  total_tokens: number;
  cost_usd: number | null;
  similarity: number;
};

export type Reply = {
  summary: string;
  recommendation: string;
  lines: ReplyLine[];
  suggested: number;
  similar?: SimilarTask[];
  live?: boolean;
};

export type Starter = {
  id: string;
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

const replies: Record<string, Reply> = {
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

export function buildReply(prompt: string): Reply {
  const scripted = replies[prompt];
  if (scripted) return scripted;

  const words = Math.max(4, prompt.trim().split(/\s+/).filter(Boolean).length);
  const full = words * 40;
  const lean = Math.round(full * 0.42);

  return {
    summary: `That request is about ${full.toLocaleString()} tokens once the surrounding context is included.`,
    recommendation:
      "Ask for the decision first, and attach only the context that decision needs.",
    lines: [
      { label: "Full version", tokens: full },
      { label: "Lean version", tokens: lean },
    ],
    suggested: lean,
  };
}

export const benefits = [
  "Estimate a prompt before you send it",
  "Compare a lean path with the full one",
  "Cap what an agent can spend",
  "Pick a cheaper setup for the same task",
];
