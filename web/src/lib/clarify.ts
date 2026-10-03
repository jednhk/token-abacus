import { demoAnswer, type DemoAnswer, type SolutionPoint } from "@/lib/demo-answer";
import { formatTokens } from "@/lib/format";

export type ClarifyChoice = {
  label: string;
  weight: number;
};

export type ClarifyQuestion = {
  ask: string;
  choices: ClarifyChoice[];
};

export type ClarifyPick = {
  ask: string;
  label: string;
  weight: number;
};

const landing: ClarifyQuestion[] = [
  {
    ask: "How many pages?",
    choices: [
      { label: "Just the hero", weight: 0.65 },
      { label: "A few pages", weight: 1 },
      { label: "A small site", weight: 1.7 },
    ],
  },
  {
    ask: "What's the use case?",
    choices: [
      { label: "Waitlist", weight: 0.8 },
      { label: "Product marketing", weight: 1 },
      { label: "Docs or a changelog", weight: 1.15 },
    ],
  },
  {
    ask: "What's the hard feature?",
    choices: [
      { label: "A form, nothing else", weight: 0.75 },
      { label: "Payments", weight: 1.45 },
      { label: "Accounts or auth", weight: 1.35 },
      { label: "Custom animation", weight: 1.2 },
    ],
  },
  {
    ask: "How much will you paste into the prompt?",
    choices: [
      { label: "The goal only", weight: 0.6 },
      { label: "A few files", weight: 1 },
      { label: "The whole repo or a long chat", weight: 1.8 },
    ],
  },
];

const checkout: ClarifyQuestion[] = [
  {
    ask: "What are you charging?",
    choices: [
      { label: "One product", weight: 0.8 },
      { label: "Subscriptions", weight: 1.15 },
      { label: "Usage-based", weight: 1.35 },
    ],
  },
  {
    ask: "How many screens?",
    choices: [
      { label: "Checkout only", weight: 0.7 },
      { label: "Pricing and checkout", weight: 1 },
      { label: "Billing portal too", weight: 1.5 },
    ],
  },
  {
    ask: "What's the hard part?",
    choices: [
      { label: "The form", weight: 0.75 },
      { label: "The Stripe webhook", weight: 1.3 },
      { label: "Tax, trials, or coupons", weight: 1.55 },
    ],
  },
  {
    ask: "How much of the codebase goes in the prompt?",
    choices: [
      { label: "The route only", weight: 0.65 },
      { label: "A few files", weight: 1 },
      { label: "The whole app", weight: 1.7 },
    ],
  },
];

const thread: ClarifyQuestion[] = [
  {
    ask: "How long is the Cursor chat?",
    choices: [
      { label: "A few turns", weight: 0.55 },
      { label: "This afternoon", weight: 1 },
      { label: "Days of context", weight: 1.8 },
    ],
  },
  {
    ask: "What are you trying to ship from it?",
    choices: [
      { label: "A bugfix", weight: 0.7 },
      { label: "A feature", weight: 1 },
      { label: "A refactor", weight: 1.35 },
    ],
  },
  {
    ask: "What has to stay in context?",
    choices: [
      { label: "The latest decision", weight: 0.6 },
      { label: "The files you touched", weight: 1 },
      { label: "The whole plan", weight: 1.6 },
    ],
  },
];

const mvp: ClarifyQuestion[] = [
  {
    ask: "How many screens are in the MVP?",
    choices: [
      { label: "One screen", weight: 0.6 },
      { label: "A few screens", weight: 1 },
      { label: "The whole loop", weight: 1.7 },
    ],
  },
  {
    ask: "What's the use case?",
    choices: [
      { label: "A tool for yourself", weight: 0.75 },
      { label: "A SaaS", weight: 1.1 },
      { label: "A marketplace", weight: 1.4 },
    ],
  },
  {
    ask: "What's the hard feature?",
    choices: [
      { label: "None yet", weight: 0.7 },
      { label: "Auth", weight: 1.2 },
      { label: "Payments", weight: 1.4 },
      { label: "An AI feature", weight: 1.55 },
    ],
  },
  {
    ask: "Who's building it?",
    choices: [
      { label: "You in Cursor", weight: 1 },
      { label: "An agent", weight: 1.25 },
      { label: "Both", weight: 1.45 },
    ],
  },
];

const general: ClarifyQuestion[] = [
  {
    ask: "What are you shipping?",
    choices: [
      { label: "A landing page", weight: 0.7 },
      { label: "One feature", weight: 1 },
      { label: "A whole product", weight: 1.6 },
    ],
  },
  {
    ask: "How big is it?",
    choices: [
      { label: "One screen", weight: 0.65 },
      { label: "A few screens", weight: 1 },
      { label: "A product", weight: 1.6 },
    ],
  },
  {
    ask: "What's the hard feature?",
    choices: [
      { label: "None yet", weight: 0.7 },
      { label: "Auth", weight: 1.2 },
      { label: "Payments", weight: 1.4 },
      { label: "Something with AI", weight: 1.55 },
    ],
  },
  {
    ask: "How much context goes in the prompt?",
    choices: [
      { label: "The goal only", weight: 0.6 },
      { label: "A few files", weight: 1 },
      { label: "The whole repo", weight: 1.75 },
    ],
  },
  {
    ask: "How do you usually build it?",
    choices: [
      { label: "You in Cursor", weight: 0.9 },
      { label: "An agent", weight: 1.2 },
      { label: "Both", weight: 1.4 },
    ],
  },
];

export function questionsFor(prompt: string): ClarifyQuestion[] {
  const text = prompt.toLowerCase();
  if (/checkout|stripe|billing|payment/.test(text)) return checkout;
  if (/cursor|thread|trim|cut this/.test(text)) return thread;
  if (/mvp|one screen|saas/.test(text)) return mvp;
  if (/waitlist|landing|page|site|hero/.test(text)) return landing;
  return general;
}

export function shapeEstimate(prompt: string, picks: ClarifyPick[]): DemoAnswer {
  const base = demoAnswer(prompt);
  const factor = clamp(
    picks.reduce((total, pick) => total * pick.weight, 1),
    0.35,
    3.2,
  );
  const models = base.models.map((point) => scalePoint(point, factor));
  const optimizations = base.optimizations.map((point) => scalePoint(point, factor));
  const said = picks.map((pick) => pick.label).join(", ");
  return {
    ...base,
    prose: said ? `You said ${said}.` : "Here is the shape for this task.",
    card: {
      title: "Token sketch",
      detail: `${formatTokens(total(recommended(models)))} on the lean model`,
    },
    models,
    optimizations,
  };
}

function scalePoint(point: SolutionPoint, factor: number): SolutionPoint {
  return {
    ...point,
    input: snap(point.input * factor),
    output: snap(point.output * factor),
  };
}

function snap(value: number) {
  return Math.max(2_000, Math.round(value / 1000) * 1000);
}

function recommended(points: SolutionPoint[]) {
  return points.find((point) => point.recommended) ?? points[0];
}

function total(point: SolutionPoint) {
  return point.input + point.output;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
