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

/** Exact token usage per model between `start` and `end` (epoch ms), read from transcripts. */
export async function readUsage(files: string[], start: number, end: number): Promise<ModelUsage[]> {
  const seen = new Set<string>();
  const byModel = new Map<string, ModelUsage>();
  for (const file of files) {
    if (!existsSync(file) || statSync(file).mtimeMs < start) continue;   // untouched since the task began
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
      const totals = byModel.get(model) ??
        { model, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 };
      totals.input_tokens += usage.input_tokens ?? 0;
      totals.output_tokens += usage.output_tokens ?? 0;
      totals.cache_read_tokens += usage.cache_read_input_tokens ?? 0;
      totals.cache_write_tokens += usage.cache_creation_input_tokens ?? 0;
      byModel.set(model, totals);
    }
  }
  // Primary model (most output tokens) first.
  return [...byModel.values()].sort((a, b) => b.output_tokens - a.output_tokens);
}

export function sessionId(sessionFile: string): string {
  return basename(sessionFile, ".jsonl");
}
