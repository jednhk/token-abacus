export type DemoCard = {
  title: string;
  detail: string;
};

export type DemoCase = {
  title: string;
  model: string;
  cost: string;
};

export type SolutionPoint = {
  name: string;
  input: number;
  output: number;
  recommended?: boolean;
};

export type DemoAnswer = {
  prose: string;
  card: DemoCard;
  cases: DemoCase[];
  models: SolutionPoint[];
  optimizations: SolutionPoint[];
};

const answers: { test: (prompt: string) => boolean; answer: DemoAnswer }[] = [
  {
    test: (prompt) => /checkout|haiku|which model|cheaper/.test(prompt),
    answer: {
      prose:
        "A Stripe checkout draft finishes on a small model for about $0.18. Keep the larger model for a short webhook check, which is the part that pushes a similar run up to $1.10.",
      card: { title: "Haiku, then a webhook check", detail: "$0.18 · 90k token budget" },
      cases: [
        { title: "Checkout form and pricing toggle", model: "Haiku", cost: "$0.09" },
        { title: "Login redirect after payment", model: "GPT-5", cost: "$0.22" },
        { title: "Same checkout rewritten on Opus", model: "Opus", cost: "$1.10" },
      ],
      models: [
        { name: "Opus", input: 360_000, output: 62_000 },
        { name: "Sonnet", input: 148_000, output: 24_000 },
        { name: "GPT-5", input: 82_000, output: 16_000 },
        { name: "Haiku", input: 74_000, output: 16_000, recommended: true },
      ],
      optimizations: [
        { name: "Whole checkout", input: 340_000, output: 52_000 },
        { name: "Form only", input: 64_000, output: 18_000 },
        { name: "Then a webhook check", input: 72_000, output: 18_000, recommended: true },
        { name: "Cached billing rules", input: 14_000, output: 6_000 },
      ],
    },
  },
  {
    test: (prompt) => /cursor|thread|trim|cut/.test(prompt),
    answer: {
      prose:
        "The feature is cheap. The Cursor thread you keep rereading is the cost. Keeping the goal and the latest decision drops a run like this from about $1.40 to $0.31.",
      card: { title: "Trimmed Cursor thread", detail: "$0.31 · 140k tokens" },
      cases: [
        { title: "Full Cursor chat, every tool result", model: "Sonnet", cost: "$1.40" },
        { title: "Goal plus the latest decision", model: "Sonnet", cost: "$0.31" },
        { title: "Cached project instructions", model: "Haiku", cost: "$0.04" },
      ],
      models: [
        { name: "Opus", input: 720_000, output: 110_000 },
        { name: "Sonnet", input: 460_000, output: 70_000 },
        { name: "GPT-5", input: 210_000, output: 36_000 },
        { name: "Haiku", input: 98_000, output: 22_000, recommended: true },
      ],
      optimizations: [
        { name: "Full Cursor chat", input: 560_000, output: 80_000 },
        { name: "Latest tool results", input: 240_000, output: 40_000 },
        { name: "Goal + decision", input: 112_000, output: 28_000, recommended: true },
        { name: "Cached project rules", input: 12_000, output: 6_000 },
      ],
    },
  },
  {
    test: (prompt) => /mvp|outline|one screen|first pass/.test(prompt),
    answer: {
      prose:
        "Asking for the whole MVP in one shot spends tokens on planning and coding together. An outline is about $0.04, and only the screen you keep needs the full build, near $0.22.",
      card: { title: "Outline, then one screen", detail: "$0.22 · 80k token budget" },
      cases: [
        { title: "Whole MVP, plan and code together", model: "Sonnet", cost: "$0.88" },
        { title: "Screen list only", model: "Haiku", cost: "$0.04" },
        { title: "Code the screen you ship tonight", model: "Sonnet", cost: "$0.18" },
      ],
      models: [
        { name: "Opus", input: 520_000, output: 90_000 },
        { name: "Sonnet", input: 250_000, output: 60_000 },
        { name: "GPT-5", input: 120_000, output: 28_000 },
        { name: "Haiku", input: 36_000, output: 12_000, recommended: true },
      ],
      optimizations: [
        { name: "Whole MVP", input: 250_000, output: 60_000 },
        { name: "Screen list only", input: 9_000, output: 3_000 },
        { name: "Tonight's screen", input: 48_000, output: 16_000 },
        { name: "Outline, then build", input: 62_000, output: 18_000, recommended: true },
      ],
    },
  },
];

const fallback: DemoAnswer = {
  prose:
    "A waitlist page like this lands near $0.37 on Sonnet. A first pass on a smaller model usually ships the hero and the form for about $0.12, and the larger model is only needed if that pass misses.",
  card: { title: "Small model first", detail: "$0.12 · 64k token budget" },
  cases: [
    { title: "Waitlist hero, form, and thank-you", model: "Sonnet", cost: "$0.37" },
    { title: "Hero and email capture only", model: "Haiku", cost: "$0.09" },
    { title: "Same page kept on a large model", model: "Opus", cost: "$2.85" },
  ],
  models: [
    { name: "Opus", input: 780_000, output: 110_000 },
    { name: "Sonnet", input: 140_000, output: 24_000 },
    { name: "GPT-5", input: 78_000, output: 18_000 },
    { name: "Haiku", input: 48_000, output: 16_000, recommended: true },
  ],
  optimizations: [
    { name: "Large model kept", input: 780_000, output: 110_000 },
    { name: "Full page pass", input: 140_000, output: 24_000 },
    { name: "Cached brand notes", input: 14_000, output: 4_000 },
    { name: "Small model first", input: 48_000, output: 16_000, recommended: true },
  ],
};

export function demoAnswer(prompt: string): DemoAnswer {
  const text = prompt.toLowerCase();
  return answers.find((item) => item.test(text))?.answer ?? fallback;
}

export function keepsFigures(draft: string, next: string): boolean {
  const figures = draft.match(/\$\d+(?:\.\d{2})?/g) ?? [];
  if (figures.length === 0 || next.length < 40 || next.length > 700) return false;
  return figures.every((figure) => next.includes(figure));
}
