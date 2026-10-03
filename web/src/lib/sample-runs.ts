import type { RecentRun } from "./types";

export const sampleRuns: RecentRun[] = [
  {
    task: "Set up Caddy reverse proxy with TLS for a Next.js app",
    summary: "Configured Caddy with automatic HTTPS and a health check",
    harness: "claude-code",
    primary_model: "claude-sonnet-5-5",
    models: [{ model: "claude-sonnet-5-5", total_tokens: 182000, cost_usd: 0.37 }],
    total_tokens: 182000,
    cost_usd: 0.37,
    outcome: "success",
    duration_s: 750,
    created_at: new Date(Date.now() - 4 * 60_000).toISOString(),
  },
  {
    task: "Add Stripe checkout to the pricing page",
    summary: "Added Checkout session route, webhook handler and success page",
    harness: "claude-code",
    primary_model: "claude-opus-5-5",
    models: [
      { model: "claude-opus-5-5", total_tokens: 1240000, cost_usd: 2.85 },
      { model: "claude-haiku-4-5", total_tokens: 310000, cost_usd: 0.09 },
    ],
    total_tokens: 1550000,
    cost_usd: 2.94,
    outcome: "success",
    duration_s: 2710,
    created_at: new Date(Date.now() - 52 * 60_000).toISOString(),
  },
  {
    task: "Fix the login redirect loop after session expiry",
    summary: null,
    harness: "codex",
    primary_model: "gpt-5",
    models: [{ model: "gpt-5", total_tokens: 96000, cost_usd: null }],
    total_tokens: 96000,
    cost_usd: null,
    outcome: "unknown",
    duration_s: 410,
    created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  },
];
