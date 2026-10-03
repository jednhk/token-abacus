import { buildReply, type Reply } from "./content";
import { formatTokens, formatUsd } from "./format";
import type { Estimate } from "./types";

export function toReply(estimate: Estimate): Reply {
  if (!estimate.recommendation) {
    return {
      summary: "No similar tasks recorded yet, so there's no estimate for this one.",
      recommendation:
        "Run it once with the MCP server installed and it will be the first data point.",
      lines: [],
      suggested: 0,
      live: true,
    };
  }

  const recommendation = estimate.recommendation;
  const match = estimate.models.find((model) => model.model === recommendation.model);
  const count = match?.n ?? 0;

  return {
    summary: `Similar tasks cost about ${formatUsd(recommendation.budget_usd)} on ${recommendation.model} (${count} similar tasks, ${estimate.confidence} confidence).`,
    recommendation: `Use ${recommendation.model} with a ${formatTokens(recommendation.budget_tokens)}-token budget. The ceiling for this kind of task is ${formatTokens(recommendation.ceiling_tokens)}.`,
    lines: estimate.models.map((model) => ({
      label: model.model,
      tokens: Math.round(model.p50_tokens),
    })),
    suggested: recommendation.budget_tokens,
    similar: estimate.similar_tasks,
    live: true,
  };
}

export async function resolveReply(prompt: string): Promise<Reply> {
  try {
    const response = await fetch("/api/estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!response.ok) return buildReply(prompt);
    const body = (await response.json()) as {
      available?: boolean;
      estimate?: Estimate;
    };
    if (!body.available || !body.estimate) return buildReply(prompt);
    return toReply(body.estimate);
  } catch {
    return buildReply(prompt);
  }
}
