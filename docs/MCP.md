# Local MCP server — build guide

Owner: MCP teammate · API/DB counterpart: Shah · Status: ready to build

The local MCP server is the main product. It runs on the user's machine (`npx token-abacus mcp`),
gives the agent two tools — **estimate before a task, submit after it** — and reads the harness's
own session log so **token counts are exact and never come from the agent**.

---

## 1. What it does (one task, end to end)

```
User: "Set up a Caddy reverse proxy for my app"
  │
  ├─► agent calls estimate_task({ task: "Set up Caddy reverse proxy with TLS for a Next.js app" })
  │     local server: create run (run_id, start time, session log) → save to state file
  │                   POST /estimate → return "~$0.40 on Sonnet · budget 180k tokens · 31 similar"
  │
  ├─► agent does the work (normal tool use)
  │
  └─► agent calls submit_run({ run_id, outcome: "success", summary: "Configured Caddy with auto TLS" })
        local server: read session log from start → now, sum usage per model (exact)
                      POST /submit { summary, model, tokens, duration, outcome } → remove from state
```

Safety nets (so data is collected even when the agent forgets):

| Situation | Behavior |
|---|---|
| Agent never calls `submit_run` | Next `estimate_task` closes the open run first, `outcome: "unknown"` |
| Session ends (server process exits) | Shutdown handler closes and uploads the open run |
| Process killed before upload | Run is still in the state file → closed and uploaded on next start |
| Upload fails (offline, 5xx) | Payload goes to the outbox → retried on next start / next call |
| API slow or down during estimate | 3 s timeout → tool returns "No estimate available", agent continues |

## 2. Stack

- **Node 20+, TypeScript**, published to npm as `token-abacus` (check the name is free: `npm view token-abacus`).
- **`@modelcontextprotocol/sdk`** (stdio transport) + **`zod`** for tool input schemas — use the zod
  version the SDK's peer dependency asks for.
- Build with `tsup` (or `tsc`) to `dist/`; `"bin": { "token-abacus": "dist/cli.js" }` with a
  `#!/usr/bin/env node` shebang.
- No other runtime dependencies if possible — `npx` start-up time matters.

## 3. Package layout

```
cli/
  package.json
  src/
    cli.ts               subcommands: mcp | init | report (report comes later)
    mcp/server.ts        McpServer, instructions, tool registration, shutdown handlers
    mcp/tools.ts         estimate_task, submit_run handlers
    runs.ts              run lifecycle + state file (~/.token-abacus/state.json)
    api.ts               fetch wrapper: base URL, timeout, outbox retry
    config.ts            ~/.token-abacus/config.json (install_id, contribute flag)
    harness/detect.ts    which client launched us (clientInfo) + where its logs live
    harness/claude.ts    Claude Code transcript reader
    harness/codex.ts     Codex rollout reader
    init.ts              add the MCP server to each installed tool
  test/fixtures/         small real (redacted) transcript files
  test/*.test.ts
```

## 4. Tools

### `estimate_task`

| | |
|---|---|
| Description (shown to the agent) | "Get a cost and token-budget estimate for a coding task before starting it. Call this once at the start of each distinct task the user asks for. Describe the task in one specific sentence (what + stack), not the user's raw words. Skip it for questions and trivial one-step edits." |
| Input | `task: string` (required, 10–300 chars) · `model?: string` (the model you are running as, if known) · `cwd?: string` (absolute project path; only used locally to find the session log, never uploaded) |
| Behavior | 1. If a run is open, close it (`outcome: "unknown"`) and queue its upload. 2. Create a run: `run_id = crypto.randomUUID()`, `started_at = now`, harness + log location. Save state. 3. `POST /estimate` with `{ prompt: task, model, harness }`, 3 s timeout. |
| Output | Short text for the agent + `structuredContent` with the full API response and `run_id`. |

Example text output (keep it this short — it's in the agent's context):
```
Estimate (run_id 6f1c…): ~$0.40 on claude-sonnet-5-5, budget 180k tokens (ceiling 290k), high confidence.
Based on 31 similar tasks, e.g. "Nginx reverse proxy with Let's Encrypt".
Tell the user the estimate in one line, then start. Call submit_run with this run_id when done.
```
No data: `No estimate available yet for this task (run_id 6f1c…). Call submit_run with this run_id when done.`

### `submit_run`

| | |
|---|---|
| Description | "Record a finished task so future estimates improve. Call this when the task you estimated is complete (or abandoned). Token counts are read automatically — do not include them." |
| Input | `run_id: string` · `outcome: "success" \| "partial" \| "failed" \| "abandoned"` · `summary: string` (one sentence: what was actually done, no secrets, file contents or personal names) |
| Behavior | 1. Look up the run in state (unknown id → error text, no crash). 2. `ended_at = now`. 3. Read usage from the session log between `started_at` and `ended_at` (§6). 4. If contributing is off: drop it, tell the agent "not uploaded (contribution off)". 5. `POST /submit` (§7). 6. Remove from state. |
| Output | `Recorded: 182k tokens, $0.37 on claude-sonnet-5-5 (estimate was $0.40).` |

Never put token counts in the input schema — the agent would guess them.

## 5. Server instructions

MCP servers can send `instructions` at initialization; clients that support it (Claude Code does)
add them to the agent's context. Repeat the essentials in the tool descriptions for clients that don't.

```ts
const server = new McpServer(
  { name: "token-abacus", version },
  { instructions: `Token Abacus estimates what coding tasks cost.
- At the START of each distinct task the user asks for, call estimate_task with a one-sentence task description, and tell the user the estimate in one line.
- When that task is DONE (or abandoned), call submit_run with the run_id and a one-sentence summary.
- One task = one estimate_task + one submit_run. A new request from the user is a new task.
- Skip both for questions, explanations, and trivial one-step edits.
- Never send secrets, file contents, or personal names in task or summary.` }
);
server.registerTool("estimate_task", { title, description, inputSchema: { task: z.string().min(10).max(300), ... } }, handler);
```

Rules for stdio servers: **never write to stdout** except through the SDK (it corrupts the protocol).
All logging goes to stderr or `~/.token-abacus/debug.log`.

## 6. Reading token usage from session logs

### Which client launched us
After initialization, `server.server.getClientVersion()` returns the client's `{ name, version }`.
Map it to a harness: Claude Code → `claude-code`, Codex → `codex`, anything else → `other`
(log the raw name the first time so we learn the real values).

### Claude Code (verified on real logs, Oct 2026)
- Location: `~/.claude/projects/<encoded cwd>/<sessionId>.jsonl`, where `<encoded cwd>` is the
  project path with every non-alphanumeric character replaced by `-`
  (`/Users/x/Documents/GitHub/app` → `-Users-x-Documents-GitHub-app`).
- **Subagent usage lives in separate files:** `<encoded cwd>/<sessionId>/subagents/agent-*.jsonl`. Include them.
- Which session: the `.jsonl` in that folder with the newest modification time. Fallback when the
  folder isn't found: scan `~/.claude/projects/*/*.jsonl` modified in the last hour and pick the one
  whose lines have `"cwd"` equal to our cwd. cwd source: `process.cwd()`, else the `cwd` tool argument.
- Each assistant line: `timestamp`, `requestId`, `message.model`, `message.usage.{input_tokens,
  output_tokens, cache_read_input_tokens, cache_creation_input_tokens}`.
- **One API response is written as several lines with the same `requestId` and identical usage —
  count each `requestId` once.** (On a real sample, ~1/3 of usage lines were repeats.)
- Re-resolve the session file at submit time, not only at estimate time (the user may have resumed
  or restarted).

```ts
type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

async function claudeUsage(files: string[], start: number, end: number) {
  const seen = new Set<string>();
  const byModel = new Map<string, Usage>();
  for (const file of files) {
    for await (const line of readLines(file)) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      const u = e?.message?.usage;
      if (!u || !e.requestId || seen.has(e.requestId)) continue;
      const t = Date.parse(e.timestamp);
      if (t < start || t > end) continue;
      seen.add(e.requestId);
      const m = byModel.get(e.message.model) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      m.input += u.input_tokens ?? 0;
      m.output += u.output_tokens ?? 0;
      m.cacheRead += u.cache_read_input_tokens ?? 0;
      m.cacheWrite += u.cache_creation_input_tokens ?? 0;
      byModel.set(e.message.model, m);
    }
  }
  return byModel;   // primary model = most output tokens; send all models in `models`
}
```
Logs can be large: stream line by line, and skip files whose mtime is before `start`.

### Codex (verify against a real file before relying on it)
- Location: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`; pick the newest whose session metadata
  `cwd` matches ours.
- Expected: `event_msg` entries of type `token_count` carrying **cumulative** totals
  (`input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_output_tokens`), and
  `turn_context` entries carrying the model. Usage for a run = cumulative at end − cumulative at start.
- Grab a real rollout file from a teammate who uses Codex and add it to `test/fixtures` first.

### Other clients (Cursor, etc.)
No readable log yet → submit with `token_source: "none"`. The server stores these as `pending`
and excludes them from estimates until tokens are filled in later (e.g. by the report CLI).

## 7. API contract (Supabase Edge Functions)

Base URL: `https://fgkiecqobecqwwqixrem.supabase.co/functions/v1` — override with `TOKEN_ABACUS_API`
(use `mock` for local development: canned responses, no network).
Headers: `content-type: application/json`, `x-abacus-install: <install_id>`.
Functions run with JWT verification off; abuse is handled by per-install rate limits.

`POST /estimate` — request `{ prompt, model?, harness }` → response as in PLAN.md §5.

`POST /submit`
```json
{
  "run_id": "6f1c…",                 // client-generated UUID → server upserts, so retries are safe
  "summary": "Configured Caddy reverse proxy with automatic TLS",
  "task": "Set up Caddy reverse proxy with TLS for a Next.js app",   // the estimate text
  "harness": "claude-code", "client_version": "2.1.0",
  "outcome": "success",
  "started_at": "2026-10-04T10:00:00Z", "ended_at": "2026-10-04T10:12:30Z",
  "token_source": "transcript",       // transcript | none
  "models": [ { "model": "claude-sonnet-5-5", "input_tokens": 12000, "output_tokens": 9000,
                "cache_read_tokens": 150000, "cache_write_tokens": 11000 } ]
}
```
→ `{ "id": "uuid", "cost_usd": 0.37, "status": "recorded" | "pending", "flagged": false }`

## 8. Local state

`~/.token-abacus/` (create with mode 700):

| File | Contents |
|---|---|
| `config.json` | `{ install_id, contribute: true/false, api? }` — written by `init` |
| `state.json` | open runs keyed by `run_id`: `{ task, started_at, harness, cwd, log_file, pid }` |
| `outbox.jsonl` | submit payloads that failed to upload |
| `debug.log` | stderr-style log, capped at ~1 MB |

Several sessions can run at once (one server process each), so: key state by `run_id`, store the
owning `pid`, write with write-temp-then-rename, and on start-up only auto-close runs whose `pid`
is no longer alive.

## 9. Shutdown

The client ends the session by closing stdin (or sending SIGTERM/SIGINT). Handle all three:
close this process's open run, try the upload with a ~2 s timeout, and if it doesn't finish the run
stays in `state.json` and is uploaded on the next start. Never block exit for longer than ~2 s.

## 10. `token-abacus init`

1. Create `~/.token-abacus/config.json` with a new `install_id`.
2. Ask: "Contribute anonymized task summaries and token counts to improve estimates? [Y/n]".
   Show exactly what is sent (summary, task sentence, model, token counts, timestamps, harness).
3. Detect installed tools and add the server:
   - **Claude Code:** `claude mcp add --scope user token-abacus -- npx -y token-abacus@1 mcp`
   - **Codex** (`~/.codex/config.toml`, append if missing):
     ```toml
     [mcp_servers.token-abacus]
     command = "npx"
     args = ["-y", "token-abacus@1", "mcp"]
     ```
   - **Cursor** (`~/.cursor/mcp.json`, merge into `mcpServers`):
     ```json
     { "mcpServers": { "token-abacus": { "command": "npx", "args": ["-y", "token-abacus@1", "mcp"] } } }
     ```
4. Print what was changed and how to undo it.

## 11. Privacy rules (enforce in code, not just docs)

- Uploaded text is only `task` and `summary`. Before sending, run a local scrubber: drop
  anything matching API-key patterns (`sk-…`, `ghp_…`, `AKIA…`, JWTs), emails, URLs with query
  strings, and absolute paths. Truncate each to 300 chars.
- Never upload `cwd`, file names, file contents, or log lines.
- `contribute: false` → estimates still work; nothing is submitted.

## 12. Build order

| # | Milestone | Done when |
|---|---|---|
| 1 | Scaffold package, stdio server with both tools returning mock data | Tools callable in MCP Inspector: `npx @modelcontextprotocol/inspector node dist/cli.js mcp` |
| 2 | Claude Code transcript reader + tests on fixture files | Sums match a hand-check on one real session (dedupe by `requestId`, subagents included) |
| 3 | Run lifecycle + `state.json` | estimate → submit returns exact tokens for the work in between |
| 4 | Safety nets: auto-close on next estimate, shutdown handler, stale runs on start, outbox | Killing the process mid-task still produces an upload on next start |
| 5 | Real API (`/estimate`, `/submit`) with timeout | End-to-end against Supabase |
| 6 | Try it for real in Claude Code | Agent calls both tools unprompted on 3 different tasks |
| 7 | `init` command | Fresh machine: one command, then it works in Claude Code + Cursor |
| 8 | Codex reader | Verified on a real rollout file |
| 9 | Publish to npm (`token-abacus@1.0.0`) | `npx -y token-abacus@1 mcp` works from a clean directory |

Until the real API is deployed, build against `TOKEN_ABACUS_API=mock`.

## 13. Test checklist

- Tool call with the API down → returns quickly with "No estimate available".
- Two Claude Code sessions in different projects at once → each run reads its own log.
- Agent never calls `submit_run` → next `estimate_task` uploads the previous run as `unknown`.
- `kill -9` the server mid-run → next start uploads it.
- Summary containing `sk-ant-…` and an email → both stripped before upload.
- `contribute: false` → no network call to `/submit`.
- Nothing printed to stdout outside the protocol.
