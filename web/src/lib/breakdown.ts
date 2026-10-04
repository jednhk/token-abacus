// A task priced as the sum of its subtasks, each matched against recorded runs.

export type SubtaskCost = {
  title: string;
  model: string | null;
  usd: number | null;
  high_usd: number | null;
  tokens: number | null;
  similar: number;
  confidence: "high" | "medium" | "low" | "none";
  closest: string | null;
  // True when the only data for this subtask is on a model they didn't say they have.
  outside: boolean;
  // Overrides for hand-written results: the price as shown, and where it comes from.
  label?: string;
  basis?: string;
};

export type Breakdown = {
  task: string;
  total_usd: number;
  total_high_usd: number;
  total_tokens: number;
  priced: number;
  subtasks: SubtaskCost[];
  // A hand-written explanation shown under the total and spoken as is.
  summary?: string;
};
