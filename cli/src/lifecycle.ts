import { appendFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { submit, type ModelUsage, type SubmitPayload, type SubmitResponse } from "./api.js";
import { homeDir, loadConfig, log } from "./config.js";
import { findLog, promptTimes, usageBetween } from "./harness/detect.js";
import { getRun, removeRun, saveRun, type Run } from "./runs.js";
import { scrub } from "./scrub.js";

export type Outcome = NonNullable<Run["outcome"]>;

export interface CloseResult {
  usage: ModelUsage[] | null;
  /** The log window that was measured, when the log could be read. */
  window?: { start: number; end: number; logFile: string | null };
  /** False when the user turned contribution off: nothing was sent. */
  contributed: boolean;
  /** null when not contributed or the upload was queued for retry. */
  response: SubmitResponse | null;
}

// A task's cost covers the whole turn, not just the stretch between the two tool calls:
//   start = the prompt that started it (or the end of the previous task in this session)
//   end   = the next prompt (or the next task's estimate, or when we measure)
// The request that calls submit_run and the agent's closing reply are written to the log only
// after submit_run returns, so submit uploads a provisional count and the run is measured again
// once the turn is over. Both uploads use the same run_id; the second replaces the first.

const SETTLE_MS = Number(process.env.TOKEN_ABACUS_SETTLE_MS ?? 45_000);

/** End of the last task measured in this process; the next task can't count tokens before it. */
let lastBoundary = 0;

export function nextFloor(): number {
  return lastBoundary;
}

/** submit_run: record the outcome, upload what the log shows now, and schedule the final recount. */
export async function submitRun(run: Run, outcome: Outcome, summary: string): Promise<CloseResult> {
  const submitted: Run = { ...run, outcome, summary, ended_at: new Date().toISOString() };
  saveRun(submitted);
  const result = await measureAndUpload(submitted, { owned: true, end: Date.now() });
  setTimeout(() => {
    const current = getRun(run.run_id);
    if (current) void finalizeRun(current, { owned: true }).catch((e) => log(`final recount failed: ${e}`));
  }, SETTLE_MS).unref();
  return result;
}

/**
 * Final measurement: upload the whole turn's usage and forget the run.
 * `owned` = this process started the run, so the session is live and "now" bounds the window.
 * Otherwise the run was orphaned by a dead process and the log's last write marks the end.
 * `upperBound` = when the next task began (its estimate), so this task can't absorb it.
 */
export async function finalizeRun(
  run: Run,
  { owned, upperBound, timeoutMs }: { owned: boolean; upperBound?: number; timeoutMs?: number },
): Promise<CloseResult> {
  const end = owned ? Date.now() : lastWrite(run.log_file) ?? Date.now();
  const result = await measureAndUpload(run, { owned, end, upperBound, timeoutMs });
  removeRun(run.run_id);                     // a failed upload is already queued in the outbox
  if (result.window) recordHistory(run.run_id, result.window);
  return result;
}

async function measureAndUpload(
  run: Run,
  { owned, end, upperBound, timeoutMs }: { owned: boolean; end: number; upperBound?: number; timeoutMs?: number },
): Promise<CloseResult> {
  const logFile = owned ? (await findLog(run.harness, run.cwd)) ?? run.log_file : run.log_file;

  let usage: ModelUsage[] | null = null;
  let measured: CloseResult["window"];
  try {
    const window = await taskWindow(run, logFile, end, upperBound);
    if (owned) lastBoundary = Math.max(lastBoundary, window.end);
    usage = await usageBetween(run.harness, logFile, window.start, window.end);
    measured = { ...window, logFile };
  } catch (error) {
    log(`reading usage for ${run.run_id} failed: ${error}`);
  }

  if (!loadConfig().contribute) return { usage, window: measured, contributed: false, response: null };

  const payload: SubmitPayload = {
    run_id: run.run_id,
    task: scrub(run.task),
    summary: scrub(run.summary ?? run.task),
    harness: run.harness,
    client_version: run.client_version,
    outcome: run.outcome ?? "unknown",
    started_at: run.started_at,
    ended_at: run.ended_at ?? new Date(end).toISOString(),
    token_source: usage && usage.length ? "transcript" : "none",
    models: usage ?? [],
  };
  const response = await submit(payload, timeoutMs);
  return { usage, window: measured, contributed: true, response };
}

/**
 * Tasks this machine already recorded live, so `token-abacus import` doesn't upload them again
 * from the same log. One JSON line per task in ~/.token-abacus/history.jsonl.
 */
function recordHistory(runId: string, window: NonNullable<CloseResult["window"]>): void {
  if (!window.logFile || !Number.isFinite(window.end)) return;
  try {
    appendFileSync(join(homeDir(), "history.jsonl"),
      `${JSON.stringify({ run_id: runId, log_file: window.logFile, start: window.start, end: window.end })}\n`,
      { mode: 0o600 });
  } catch (e) {
    log(`writing history failed: ${e}`);
  }
}

async function taskWindow(run: Run, logFile: string | null, end: number, upperBound?: number) {
  const started = Date.parse(run.started_at);
  const ended = run.ended_at ? Date.parse(run.ended_at) : end;
  const prompts = await promptTimes(run.harness, logFile);
  const startPrompt = prompts.filter((t) => t <= started).at(-1);
  const nextPrompt = prompts.find((t) => t > ended);
  return {
    start: Math.max(startPrompt ?? started, run.floor ?? 0),
    end: Math.min(end, nextPrompt ?? Infinity, upperBound ?? Infinity),
  };
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
