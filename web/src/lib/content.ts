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
    label: "What will a waitlist page cost?",
    prompt: "What will a waitlist page cost?",
  },
  {
    id: "model",
    label: "Can Haiku ship my checkout?",
    prompt: "Can Haiku ship my checkout?",
  },
  {
    id: "trim",
    label: "Cut this Cursor chat and still ship?",
    prompt: "Cut this Cursor chat and still ship?",
  },
  {
    id: "split",
    label: "Plan the MVP, then code one screen?",
    prompt: "Plan the MVP, then code one screen?",
  },
];

const replies: Record<string, Reply> = {
  "What will a waitlist page cost?": {
    summary:
      "The page itself is small. The tokens pile up in the brand notes pasted around it.",
    recommendation:
      "Send the page goal first, and only the copy the hero depends on.",
    lines: [
      { label: "Task only", tokens: 220 },
      { label: "Typical attached context", tokens: 2400 },
      { label: "Lean version", tokens: 640 },
    ],
    suggested: 640,
  },
  "Can Haiku ship my checkout?": {
    summary:
      "The checkout form is fine on a small model. Keep the larger model for the webhook check.",
    recommendation:
      "Draft checkout on Haiku, and escalate only if the webhook pass misses.",
    lines: [
      { label: "Small-model draft", tokens: 260 },
      { label: "Large-model redo", tokens: 1100 },
      { label: "Suggested path", tokens: 420 },
    ],
    suggested: 420,
  },
  "Cut this Cursor chat and still ship?": {
    summary:
      "The feature is cheap. The Cursor thread around it is what you keep paying to reread.",
    recommendation:
      "Keep the goal and the latest decision. Drop the old tool output.",
    lines: [
      { label: "Original prompt", tokens: 1800 },
      { label: "Repeated instructions", tokens: 700 },
      { label: "Trimmed prompt", tokens: 540 },
    ],
    suggested: 540,
  },
  "Plan the MVP, then code one screen?": {
    summary:
      "One giant request spends tokens planning the whole app and coding it at the same time.",
    recommendation:
      "Ask for the screen list first. Code only the screen you are shipping tonight.",
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
