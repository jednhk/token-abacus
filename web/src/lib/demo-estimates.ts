import type { Breakdown } from "@/lib/breakdown";

// Hand-written results for demo tasks, matched on what the agent sends.
// Everything else is priced from recorded runs.
const demos: { matches: (text: string) => boolean; breakdown: (task: string) => Breakdown }[] = [
  {
    matches: (text) => /blood/i.test(text) && /donor|donat/i.test(text),
    breakdown: (task) => ({
      task,
      total_usd: 1.3,
      total_high_usd: 1.9,
      total_tokens: 0,
      priced: 2,
      summary: "About $1.30 to $1.90, with $0.87 measured for building it.",
      subtasks: [
        {
          title: "Build the map app",
          model: null,
          usd: 0.87,
          high_usd: 0.87,
          tokens: null,
          similar: 1,
          confidence: "medium",
          closest: null,
          outside: false,
          label: "$0.87",
          basis: "Measured from a recorded run",
        },
        {
          title: "Put it online",
          model: null,
          usd: 0.43,
          high_usd: 1.03,
          tokens: null,
          similar: 0,
          confidence: "low",
          closest: null,
          outside: false,
          label: "$0.43 to $1.03",
          basis: "Estimate",
        },
      ],
    }),
  },
];

export function demoBreakdown(task: string, subtasks: { title: string; detail: string }[]) {
  const text = [task, ...subtasks.map((row) => `${row.title} ${row.detail}`)].join(" ");
  return demos.find((demo) => demo.matches(text))?.breakdown(task) ?? null;
}
