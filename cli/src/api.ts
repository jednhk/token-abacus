import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homeDir, loadConfig, log } from "./config.js";

const DEFAULT_API = "https://fgkiecqobecqwwqixrem.supabase.co/functions/v1";
const ESTIMATE_TIMEOUT_MS = 3_000;
const SUBMIT_TIMEOUT_MS = 5_000;

export interface ModelUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  /** All cache writes, 5-minute and 1-hour. */
  cache_write_tokens: number;
  /** The part of cache_write_tokens written with a 1-hour lifetime (billed at a higher rate). */
  cache_write_1h_tokens: number;
  /** Per request: [input, output, cache_read, cache_write, cache_write_1h]. */
  requests?: number[][];
}

export interface EstimateRequest {
  prompt: string;
  model?: string;
  harness: string;
}

export interface EstimateResponse {
  recommendation: {
    model: string;
    budget_tokens: number;
    budget_usd: number;
    ceiling_tokens: number;
    ceiling_usd: number;
  } | null;
  confidence: "high" | "medium" | "low" | "none";
  models: {
    model: string; n: number; success_rate: number;
    p50_tokens: number; p85_tokens: number; p50_usd: number; p85_usd: number;
  }[];
  similar_tasks: { title: string; model: string; total_tokens: number; cost_usd: number; similarity: number }[];
  /** Present when a model was sent: false means no similar tasks on that model yet. */
  for_requested_model?: boolean;
  /** A cheaper reliable model than the one recommended, if any. */
  alternative?: {
    model: string; budget_tokens: number; budget_usd: number; ceiling_tokens: number; ceiling_usd: number;
    n: number; success_rate: number | null;
  } | null;
}

export interface SubmitPayload {
  run_id: string;
  task: string;
  summary: string;
  harness: string;
  client_version?: string;
  outcome: "success" | "partial" | "failed" | "abandoned" | "unknown";
  started_at: string;
  ended_at: string;
  token_source: "transcript" | "none";
  models: ModelUsage[];
}

export interface SubmitResponse {
  id: string;
  cost_usd: number | null;
  status: "recorded" | "pending";
  flagged: boolean;
}

function baseUrl(): string {
  return process.env.TOKEN_ABACUS_API ?? loadConfig().api ?? DEFAULT_API;
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const response = await fetch(`${baseUrl()}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-abacus-install": loadConfig().install_id },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

/** Returns null when the API is slow or down — an estimate must never block the agent. */
export async function estimate(request: EstimateRequest): Promise<EstimateResponse | null> {
  if (baseUrl() === "mock") return mockEstimate(request);
  try {
    return await post<EstimateResponse>("estimate", request, ESTIMATE_TIMEOUT_MS);
  } catch (error) {
    log(`estimate failed: ${error}`);
    return null;
  }
}

/** Uploads a finished task. On failure the payload is queued in the outbox and null is returned. */
export async function submit(payload: SubmitPayload, timeoutMs = SUBMIT_TIMEOUT_MS): Promise<SubmitResponse | null> {
  if (baseUrl() === "mock") return mockSubmit(payload);
  try {
    return await post<SubmitResponse>("submit", payload, timeoutMs);
  } catch (error) {
    log(`submit failed, queued in outbox: ${error}`);
    appendFileSync(outboxPath(), `${JSON.stringify(payload)}\n`, { mode: 0o600 });
    return null;
  }
}

function outboxPath(): string {
  return join(homeDir(), "outbox.jsonl");
}

/** Retry queued uploads. Submit is an upsert by run_id, so retrying is always safe. */
export async function flushOutbox(): Promise<void> {
  let lines: string[];
  try {
    lines = readFileSync(outboxPath(), "utf8").split("\n").filter(Boolean);
  } catch {
    return;
  }
  if (lines.length === 0) return;
  writeFileSync(outboxPath(), "");          // submit() re-queues anything that fails again
  for (const line of lines) {
    try {
      await submit(JSON.parse(line) as SubmitPayload);
    } catch {
      log(`dropping unreadable outbox line`);
    }
  }
}

// ── mock API (TOKEN_ABACUS_API=mock) ─────────────────────────────────────────────────────────
// Prices here are placeholders for development only; real cost is always computed server-side.
const MOCK_PRICES: Record<string, [number, number, number, number]> = {
  sonnet: [3, 15, 0.3, 3.75],
  opus: [5, 25, 0.5, 6.25],
  haiku: [1, 5, 0.1, 1.25],
};

function mockCost(usage: ModelUsage): number {
  const family = Object.keys(MOCK_PRICES).find((name) => usage.model.includes(name)) ?? "sonnet";
  const [input, output, cacheRead, cacheWrite] = MOCK_PRICES[family];
  return (usage.input_tokens * input + usage.output_tokens * output +
    usage.cache_read_tokens * cacheRead + usage.cache_write_tokens * cacheWrite) / 1_000_000;
}

function mockEstimate(request: EstimateRequest): EstimateResponse {
  const model = request.model ?? "claude-sonnet-5-5";
  return {
    recommendation: { model, budget_tokens: 180_000, budget_usd: 0.4, ceiling_tokens: 290_000, ceiling_usd: 0.65 },
    confidence: "high",
    models: [{ model, n: 31, success_rate: 0.9, p50_tokens: 120_000, p85_tokens: 156_000, p50_usd: 0.27, p85_usd: 0.35 }],
    similar_tasks: [{ title: "Nginx reverse proxy with Let's Encrypt", model, total_tokens: 140_000, cost_usd: 0.31, similarity: 0.91 }],
  };
}

function mockSubmit(payload: SubmitPayload): SubmitResponse {
  const recorded = payload.token_source === "transcript";
  return {
    id: payload.run_id,
    cost_usd: recorded ? payload.models.reduce((sum, usage) => sum + mockCost(usage), 0) : null,
    status: recorded ? "recorded" : "pending",
    flagged: false,
  };
}
