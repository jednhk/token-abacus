import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ModelUsage, SubmitPayload } from "./api.js";
import { homeDir, loadConfig, VERSION } from "./config.js";
import { encodeCwd, prompts, readRequests, sessionFiles, summarize, type LoggedRequest } from "./harness/claude.js";
import { scrub } from "./scrub.js";

// `token-abacus import`: turn past Claude Code sessions into tasks with exact costs.
//
//  1. Each session is split at the prompts the person typed: one prompt and everything until the
//     next prompt is one task (the same window the MCP server uses), priced per request.
//  2. Trivial turns ("thanks", a one-line answer) are skipped, and so are windows the MCP server
//     already uploaded live (~/.token-abacus/history.jsonl).
//  3. Each task gets a one-sentence description written by the person's own Claude (Haiku via
//     `claude -p`), from the prompt with secrets removed. Raw prompts are never uploaded.
//  4. Without --upload it only writes a preview file. With --upload it sends the tasks to the
//     submit endpoint in batches; run ids are derived from the session and prompt, so running it
//     again updates the same rows instead of adding new ones.

const MIN_REQUESTS = 2;          // a task needs at least two model calls …
const MIN_OUTPUT_TOKENS = 500;   // … and some real output
const BATCH_SUMMARIES = 20;      // prompts per `claude -p` call
const BATCH_UPLOAD = 50;         // tasks per submit request

export interface ImportOptions {
  days?: number;
  upload?: boolean;
  limit?: number;
}

interface Candidate {
  run_id: string;
  session: string;
  prompt: string;
  previous: string;
  started_at: number;
  ended_at: number;
  models: ModelUsage[];
  task?: string;
}

function projectsRoot(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
}

/** Where `claude -p` runs for summaries; its own session logs are never imported. */
function summarizeDir(): string {
  const dir = join(homeDir(), "summarize");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Deterministic UUID (v5-style) so re-imports update the same rows. */
function stableId(...parts: string[]): string {
  const h = createHash("sha1").update(parts.join("|")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function loadHistory(): { log_file: string; start: number; end: number }[] {
  try {
    return readFileSync(join(homeDir(), "history.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/** Prompts that start a turn but aren't a request for work. */
function notATask(text: string): boolean {
  const t = text.trim();
  return t.startsWith("<local-command") || t.startsWith("[Request interrupted") || t.startsWith("Caveat:") || t.length < 3;
}

async function findCandidates(days: number): Promise<Candidate[]> {
  const root = projectsRoot();
  if (!existsSync(root)) return [];
  const since = Date.now() - days * 86_400_000;
  const skipProject = encodeCwd(summarizeDir());
  const history = loadHistory();
  const out: Candidate[] = [];

  for (const project of readdirSync(root)) {
    if (project === skipProject) continue;
    const dir = join(root, project);
    if (!statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      const file = join(dir, name);
      const mtime = statSync(file).mtimeMs;
      if (mtime < since) continue;
      const turns = (await prompts(file)).filter((p) => p.time >= since);
      if (turns.length === 0) continue;
      const requests = await readRequests(sessionFiles(file), turns[0].time);
      const live = Date.now() - mtime < 5 * 60_000;     // session still active: its last turn may be unfinished

      for (let i = 0; i < turns.length; i++) {
        const start = turns[i].time;
        const next = turns[i + 1]?.time;
        if (next === undefined && live) continue;
        if (notATask(turns[i].text)) continue;
        const inTurn: LoggedRequest[] = requests.filter((r) => r.time >= start && (next === undefined || r.time < next));
        const output = inTurn.reduce((n, r) => n + r.row[1], 0);
        if (inTurn.length < MIN_REQUESTS || output < MIN_OUTPUT_TOKENS) continue;
        const end = inTurn[inTurn.length - 1].time;
        if (history.some((h) => h.log_file === file && h.start < end && h.end > start)) continue;
        out.push({
          run_id: stableId("claude-code", basename(file), String(start)),
          session: file,
          prompt: turns[i].text,
          previous: i > 0 ? turns[i - 1].text : "",
          started_at: start,
          ended_at: end,
          models: summarize(inTurn),
        });
      }
    }
  }
  return out.sort((a, b) => b.started_at - a.started_at);
}

/** One-sentence task descriptions from the person's own Claude; null = not a coding task. */
function describe(batch: Candidate[]): void {
  const items = batch.map((c, i) => ({
    id: i,
    request: scrub(c.prompt.slice(0, 1500)).slice(0, 800),
    previous_request: c.previous ? scrub(c.previous.slice(0, 600)).slice(0, 300) : undefined,
  }));
  const instruction = [
    "Each item is a request a developer typed to an AI coding agent (previous_request is the one before it in the same session, for context).",
    "For each, write one specific sentence describing the task the agent was asked to do: what was built or changed, plus the stack if clear.",
    "Example: \"Add Stripe checkout and a webhook handler to a Next.js app\".",
    "If the request is mostly pasted text (another tool's output, an error log, a document), describe what the developer wanted done with it — e.g. \"Verify a calculator app's recorded token cost against session logs\" — not the pasted content itself.",
    "Never include secrets, file paths, URLs, emails, company or personal names.",
    "Use null when the request is not a task (a greeting, thanks, a yes/no reply with no context, a question unrelated to software).",
    "Reply with only a JSON array: [{\"id\": 0, \"task\": \"…\" | null}, …]",
    "",
    JSON.stringify(items),
  ].join("\n");
  const output = execFileSync("claude", ["-p", "--model", "haiku", "--strict-mcp-config"], {
    input: instruction, cwd: summarizeDir(), encoding: "utf8", timeout: 180_000, maxBuffer: 10_000_000,
  });
  const json = output.slice(output.indexOf("["), output.lastIndexOf("]") + 1);
  for (const r of JSON.parse(json) as { id: number; task: string | null }[]) {
    if (batch[r.id] && typeof r.task === "string" && r.task.trim()) batch[r.id].task = scrub(r.task.trim());
  }
}

function payload(c: Candidate): SubmitPayload & { source: "report" } {
  return {
    run_id: c.run_id,
    task: c.task!,
    summary: c.task!,
    harness: "claude-code",
    client_version: `token-abacus-import/${VERSION}`,
    outcome: "unknown",
    started_at: new Date(c.started_at).toISOString(),
    ended_at: new Date(c.ended_at).toISOString(),
    token_source: "transcript",
    source: "report",
    models: c.models,
  };
}

const total = (m: ModelUsage[]) =>
  m.reduce((n, u) => n + u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens, 0);

export async function runImport(options: ImportOptions = {}): Promise<void> {
  const days = options.days ?? 30;
  console.log(`Reading Claude Code sessions from the last ${days} days…`);
  let candidates = await findCandidates(days);
  if (options.limit) candidates = candidates.slice(0, options.limit);
  console.log(`Found ${candidates.length} tasks. Writing descriptions with your Claude (Haiku)…`);

  for (let i = 0; i < candidates.length; i += BATCH_SUMMARIES) {
    const batch = candidates.slice(i, i + BATCH_SUMMARIES);
    try {
      describe(batch);
    } catch (e) {
      console.log(`  batch ${i / BATCH_SUMMARIES + 1} failed (${(e as Error).message.split("\n")[0]}); skipping it`);
    }
    process.stdout.write(`  ${Math.min(i + BATCH_SUMMARIES, candidates.length)}/${candidates.length}\r`);
  }
  const tasks = candidates.filter((c) => c.task);
  const payloads = tasks.map(payload);

  const previewPath = join(homeDir(), "import-preview.json");
  writeFileSync(previewPath, JSON.stringify(payloads.map((p) => ({
    task: p.task, started_at: p.started_at,
    models: p.models.map((m) => ({ model: m.model, total_tokens: total([m]), requests: m.requests?.length })),
  })), null, 2));

  const byModel = new Map<string, number>();
  for (const p of payloads) for (const m of p.models) byModel.set(m.model, (byModel.get(m.model) ?? 0) + total([m]));
  console.log(`\n${tasks.length} tasks to contribute (${candidates.length - tasks.length} skipped as not tasks).`);
  console.log("Tokens by model:");
  for (const [model, n] of [...byModel].sort((a, b) => b[1] - a[1])) console.log(`  ${model.padEnd(28)} ${n.toLocaleString()}`);
  console.log("Examples:");
  for (const p of payloads.slice(0, 8)) console.log(`  - ${p.task}`);
  console.log(`\nEverything that would be uploaded: ${previewPath}`);

  if (!options.upload) {
    console.log("Nothing uploaded. Run again with --upload to contribute these tasks.");
    return;
  }
  if (!loadConfig().contribute) {
    console.log("Contribution is off in ~/.token-abacus/config.json; nothing uploaded.");
    return;
  }

  const { submitBatch } = await import("./api.js");
  let uploaded = 0;
  let cost = 0;
  for (let i = 0; i < payloads.length; i += BATCH_UPLOAD) {
    const results = await submitBatch(payloads.slice(i, i + BATCH_UPLOAD));
    for (const r of results) {
      if (r.status === "recorded") uploaded++;
      cost += r.cost_usd ?? 0;
    }
    process.stdout.write(`  uploaded ${uploaded}/${payloads.length}\r`);
  }
  console.log(`\nUploaded ${uploaded} tasks, $${cost.toFixed(2)} of real usage. Thank you!`);
}
