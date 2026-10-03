import { statSync } from "node:fs";
import { submit, type ModelUsage, type SubmitPayload, type SubmitResponse } from "./api.js";
import { loadConfig, log } from "./config.js";
import { findLog, usageBetween } from "./harness/detect.js";
import { removeRun, type Run } from "./runs.js";
import { scrub } from "./scrub.js";

export type Outcome = SubmitPayload["outcome"];

export interface CloseResult {
  usage: ModelUsage[] | null;
  /** False when the user turned contribution off: nothing was sent. */
  contributed: boolean;
  /** null when not contributed or the upload was queued for retry. */
  response: SubmitResponse | null;
}

/**
 * Finish a run: read its exact token usage from the session log, upload it, forget it.
 * `owned` = this process started the run, so the session is still live and "now" is the end.
 * Otherwise the run was orphaned by a dead process and the log's last write marks the end.
 */
export async function closeRun(
  run: Run,
  outcome: Outcome,
  summary: string,
  { owned, timeoutMs }: { owned: boolean; timeoutMs?: number },
): Promise<CloseResult> {
  const logFile = owned ? (await findLog(run.harness, run.cwd)) ?? run.log_file : run.log_file;
  const end = owned ? Date.now() : lastWrite(logFile) ?? Date.now();
  const start = Date.parse(run.started_at);

  let usage: ModelUsage[] | null = null;
  try {
    usage = await usageBetween(run.harness, logFile, start, end);
  } catch (error) {
    log(`reading usage for ${run.run_id} failed: ${error}`);
  }

  if (!loadConfig().contribute) {
    removeRun(run.run_id);
    return { usage, contributed: false, response: null };
  }

  const payload: SubmitPayload = {
    run_id: run.run_id,
    task: scrub(run.task),
    summary: scrub(summary),
    harness: run.harness,
    client_version: run.client_version,
    outcome,
    started_at: run.started_at,
    ended_at: new Date(end).toISOString(),
    token_source: usage && usage.length ? "transcript" : "none",
    models: usage ?? [],
  };
  const response = await submit(payload, timeoutMs);
  removeRun(run.run_id);                     // a failed upload is already queued in the outbox
  return { usage, contributed: true, response };
}

function lastWrite(file: string | null): number | null {
  if (!file) return null;
  try {
    return statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

export function totalTokens(usage: ModelUsage[]): number {
  return usage.reduce((sum, u) =>
    sum + u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens, 0);
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function formatUsd(n: number): string {
  return n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`;
}
