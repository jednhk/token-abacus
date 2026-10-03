import { createReadStream, existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import type { ModelUsage } from "../api.js";

// Claude Code writes one JSONL transcript per session:
//   <config>/projects/<encoded cwd>/<sessionId>.jsonl
//   <config>/projects/<encoded cwd>/<sessionId>/subagents/agent-*.jsonl   (subagent usage)
// Each assistant line carries timestamp, requestId, message.model and message.usage.
// One API response is written as several lines with the same requestId and identical usage,
// so every requestId is counted once.

function projectsRoot(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
}

/** `/Users/x/my.app` → `-Users-x-my-app` */
export function encodeCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

function newestJsonl(dir: string): string | null {
  let best: { path: string; mtime: number } | null = null;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".jsonl")) continue;
    const path = join(dir, name);
    const mtime = statSync(path).mtimeMs;
    if (!best || mtime > best.mtime) best = { path, mtime };
  }
  return best?.path ?? null;
}

async function firstCwd(file: string): Promise<string | null> {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let checked = 0;
  for await (const line of lines) {
    try {
      const cwd = JSON.parse(line)?.cwd;
      if (typeof cwd === "string") { lines.close(); return cwd; }
    } catch {}
    if (++checked > 50) break;
  }
  lines.close();
  return null;
}

/** `cwd` as given plus its symlink-resolved form (macOS: /var → /private/var, /tmp → /private/tmp). */
function cwdSpellings(cwd: string): string[] {
  let real = cwd;
  try { real = realpathSync(cwd); } catch {}
  const spellings = new Set([cwd, real, real.replace(/^\/private\//, "/")]);
  return [...spellings];
}

/** The transcript of the most recently active Claude Code session in `cwd`, or null. */
export async function findSessionFile(cwd: string): Promise<string | null> {
  const root = projectsRoot();
  const spellings = cwdSpellings(cwd);
  for (const spelling of spellings) {
    const dir = join(root, encodeCwd(spelling));
    if (!existsSync(dir)) continue;
    const file = newestJsonl(dir);
    if (file) return file;
  }
  // Fallback: the encoding rule may change — look for a recent transcript that records this cwd.
  if (!existsSync(root)) return null;
  const cutoff = Date.now() - 60 * 60 * 1000;
  const candidates: { path: string; mtime: number }[] = [];
  for (const project of readdirSync(root)) {
    const projectDir = join(root, project);
    if (!statSync(projectDir).isDirectory()) continue;
    for (const name of readdirSync(projectDir)) {
      if (!name.endsWith(".jsonl")) continue;
      const path = join(projectDir, name);
      const mtime = statSync(path).mtimeMs;
      if (mtime >= cutoff) candidates.push({ path, mtime });
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  for (const candidate of candidates) {
    const recorded = await firstCwd(candidate.path);
    if (recorded && spellings.some((s) => cwdSpellings(recorded).includes(s))) return candidate.path;
  }
  return null;
}

/** The session transcript plus its subagent transcripts. */
export function sessionFiles(sessionFile: string): string[] {
  const subagentDir = join(sessionFile.replace(/\.jsonl$/, ""), "subagents");
  const files = [sessionFile];
  if (existsSync(subagentDir)) {
    for (const name of readdirSync(subagentDir)) {
      if (name.endsWith(".jsonl")) files.push(join(subagentDir, name));
    }
  }
  return files;
}

/** One billed API request from a transcript. */
export interface LoggedRequest {
  time: number;
  model: string;
  /** [input, output, cache_read, cache_write, cache_write_1h, fast] */
  row: number[];
}

/**
 * Every billed request in the given transcripts between `start` and `end` (epoch ms), each
 * requestId once (one API response is written as several lines with identical usage).
 */
export async function readRequests(files: string[], start = 0, end = Infinity): Promise<LoggedRequest[]> {
  const seen = new Set<string>();
  const out: LoggedRequest[] = [];
  for (const file of files) {
    if (!existsSync(file) || statSync(file).mtimeMs < start) continue;   // untouched since the window began
    const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.includes('"usage"')) continue;                           // cheap pre-filter on large logs
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const usage = entry?.message?.usage;
      const requestId: string | undefined = entry?.requestId;
      if (!usage || !requestId || seen.has(requestId)) continue;
      const time = Date.parse(entry.timestamp);
      if (!(time >= start && time <= end)) continue;
      seen.add(requestId);
      const model: string = entry.message.model ?? "unknown";
      if (model === "<synthetic>") continue;                             // client-generated, not billed
      const cacheWrite = usage.cache_creation_input_tokens ?? 0;
      out.push({
        time,
        model,
        row: [
          usage.input_tokens ?? 0,
          usage.output_tokens ?? 0,
          usage.cache_read_input_tokens ?? 0,
          cacheWrite,
          // 1-hour cache writes bill at a higher rate than 5-minute ones; Claude Code uses 1-hour.
          Math.min(usage.cache_creation?.ephemeral_1h_input_tokens ?? 0, cacheWrite),
          usage.speed === "fast" ? 1 : 0,
        ],
      });
    }
  }
  return out;
}

/** Per-model totals plus per-request rows (long-context tiers and fast mode are per request). */
export function summarize(requests: LoggedRequest[]): ModelUsage[] {
  const byModel = new Map<string, ModelUsage>();
  for (const { model, row } of requests) {
    const totals = byModel.get(model) ?? {
      model, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0,
      cache_write_1h_tokens: 0, requests: [],
    };
    totals.input_tokens += row[0];
    totals.output_tokens += row[1];
    totals.cache_read_tokens += row[2];
    totals.cache_write_tokens += row[3];
    totals.cache_write_1h_tokens += row[4];
    totals.requests!.push(row);
    byModel.set(model, totals);
  }
  // Primary model (most output tokens) first.
  return [...byModel.values()].sort((a, b) => b.output_tokens - a.output_tokens);
}

/** Exact token usage per model between `start` and `end` (epoch ms), read from transcripts. */
export async function readUsage(files: string[], start: number, end: number): Promise<ModelUsage[]> {
  return summarize(await readRequests(files, start, end));
}

export interface Prompt {
  time: number;
  text: string;
}

/**
 * The prompts the human typed in this session, ascending. Tool results and injected meta lines are
 * also written as `type: "user"`, so only text the person typed counts. Task windows run from the
 * prompt that started a task to the next prompt.
 */
export async function prompts(sessionFile: string): Promise<Prompt[]> {
  const out: Prompt[] = [];
  if (!existsSync(sessionFile)) return out;
  const lines = createInterface({ input: createReadStream(sessionFile), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes('"user"')) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry?.type !== "user" || entry.isMeta || entry.isSidechain) continue;
    const content = entry.message?.content;
    let text: string | null = null;
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content) && !content.some((b: { type?: string }) => b?.type === "tool_result")) {
      const parts = content.filter((b: { type?: string }) => b?.type === "text").map((b: { text?: string }) => b.text ?? "");
      if (parts.length) text = parts.join("\n");
    }
    const time = Date.parse(entry.timestamp);
    if (text !== null && Number.isFinite(time)) out.push({ time, text });
  }
  return out.sort((a, b) => a.time - b.time);
}

export async function promptTimes(sessionFile: string): Promise<number[]> {
  return (await prompts(sessionFile)).map((p) => p.time);
}

export async function currentModel(sessionFile: string): Promise<string | null> {
  if (!existsSync(sessionFile)) return null;
  let latest: string | null = null;
  const lines = createInterface({ input: createReadStream(sessionFile), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes('"usage"')) continue;
    try {
      const model = JSON.parse(line)?.message?.model;
      if (typeof model === "string" && model !== "<synthetic>") latest = model;
    } catch {}
  }
  return latest;
}

export function sessionId(sessionFile: string): string {
  return basename(sessionFile, ".jsonl");
}
