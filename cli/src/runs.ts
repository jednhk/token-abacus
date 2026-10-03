import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homeDir, writeJsonAtomic } from "./config.js";
import type { Harness } from "./harness/detect.js";

/** A task between estimate_task and submit_run. Persisted so it survives a crash. */
export interface Run {
  run_id: string;
  task: string;
  model?: string;
  harness: Harness;
  client_version?: string;
  cwd: string;
  /** Session log found at estimate time — used when this process is gone at close time. */
  log_file: string | null;
  started_at: string;
  pid: number;
  /** What the estimate predicted, to report back at submit time. */
  estimate_usd?: number;
  /** Earliest time this task may count from: the end of the previous task in the same session. */
  floor?: number;
  /** Set by submit_run. The run stays in state until its final recount after the turn ends. */
  outcome?: "success" | "partial" | "failed" | "abandoned";
  summary?: string;
  ended_at?: string;
}

interface State {
  runs: Record<string, Run>;
}

function statePath(): string {
  return join(homeDir(), "state.json");
}

// Several sessions (one server process each) share this file. Each read-modify-write is short
// and the file is replaced atomically; a lost update only means a run is closed one start later.
function read(): State {
  try {
    return JSON.parse(readFileSync(statePath(), "utf8")) as State;
  } catch {
    return { runs: {} };
  }
}

function write(state: State): void {
  writeJsonAtomic(statePath(), state);
}

export function saveRun(run: Run): void {
  const state = read();
  state.runs[run.run_id] = run;
  write(state);
}

export function getRun(runId: string): Run | undefined {
  return read().runs[runId];
}

export function removeRun(runId: string): void {
  const state = read();
  delete state.runs[runId];
  write(state);
}

/** Open runs owned by this process. */
export function ownRuns(): Run[] {
  return Object.values(read().runs).filter((run) => run.pid === process.pid);
}

/** Open runs whose server process has exited without closing them. */
export function orphanedRuns(): Run[] {
  return Object.values(read().runs).filter((run) => run.pid !== process.pid && !isAlive(run.pid));
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
