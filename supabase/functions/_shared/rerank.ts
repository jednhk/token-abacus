import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@0.131.0/helpers/beta/zod";
import { z } from "npm:zod@4.6.5";
import { anthropic, SIZE_GUIDE } from "./tags.ts";

// Second-stage matching. Vector search finds tasks about the same topic; Claude then judges which
// of them are actually comparable work — the same kind of job, a similar size, an overlapping
// stack — so their token cost predicts the new task's. Topic alone doesn't count: a small Node
// chat app and a multi-service AWS + mobile chat system share a topic and score low.

export const RERANK_MODEL = "claude-sonnet-5-5";
export const MIN_SCORE = 7;

export interface Described {
  description: string;
  work_kind?: string | null;
  size?: string | null;
  stack?: string[] | null;
}

const Schema = z.object({
  matches: z.array(z.object({
    id: z.number().int(),
    score: z.number().int().min(0).max(10),
    reason: z.string(),
  })),
});

export interface Judgement {
  score: number;
  reason: string;
}

/** Scores 0–10 per candidate index. Throws if Claude is unavailable or declines. */
export async function rerank(query: Described, candidates: Described[]): Promise<Map<number, Judgement>> {
  const api = anthropic();
  if (!api) throw new Error("ANTHROPIC_API_KEY is not set");
  const fmt = (d: Described) => ({
    description: d.description.slice(0, 500),
    kind: d.work_kind ?? "unknown",
    size: d.size ?? "unknown",
    stack: d.stack?.length ? d.stack : "unknown",
  });

  const response = await api.beta.messages.parse({
    model: RERANK_MODEL,
    max_tokens: 8000,
    // Server-side fallback: if this model declines, the request is re-run on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(Schema) },
    system: [
      "You match software tasks for cost estimation. Given a NEW task an AI coding agent is about to do",
      "and PAST tasks other agents completed, score each past task 0-10 for how well its token cost",
      "predicts the new task's cost: how similar the actual work is.",
      "10 = essentially the same task. 7-9 = same kind of job, similar size, overlapping stack.",
      "4-6 = related, but clearly more or less work, or a different stack or kind.",
      "0-3 = different work.",
      "Sharing a topic or domain is NOT enough: a small single-server app and a large multi-service",
      "system about the same subject score 0-3. Size matters most, then kind, then stack.",
      SIZE_GUIDE,
      "Give a reason of at most 12 words. Return an entry for every past task id.",
    ].join("\n"),
    messages: [{
      role: "user",
      content: JSON.stringify({ new_task: fmt(query), past_tasks: candidates.map((c, id) => ({ id, ...fmt(c) })) }),
    }],
  });
  if (response.stop_reason === "refusal") throw new Error("rerank declined");

  const out = new Map<number, Judgement>();
  for (const m of response.parsed_output?.matches ?? []) {
    if (m.id >= 0 && m.id < candidates.length) out.set(m.id, { score: m.score, reason: m.reason });
  }
  return out;
}
