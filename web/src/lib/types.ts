export type Outcome = "success" | "partial" | "failed" | "abandoned" | "unknown";

export type RunModel = {
  model: string;
  total_tokens: number;
  cost_usd: number | null;
};

export type RecentRun = {
  task: string;
  summary: string | null;
  harness: string | null;
  primary_model: string | null;
  models: RunModel[] | null;
  total_tokens: number;
  cost_usd: number | null;
  outcome: Outcome;
  duration_s: number | null;
  created_at: string;
};

export type EstimateModel = {
  model: string;
  n: number;
  success_rate: number;
  p50_tokens: number;
  p85_tokens: number;
  p50_usd: number;
  p85_usd: number;
};

export type Estimate = {
  recommendation: {
    model: string;
    budget_tokens: number;
    budget_usd: number;
    ceiling_tokens: number;
    ceiling_usd: number;
  } | null;
  confidence: "high" | "medium" | "low" | "none";
  models: EstimateModel[];
  similar_tasks: {
    title: string;
    model: string;
    total_tokens: number;
    cost_usd: number | null;
    similarity: number;
  }[];
};
