# token-abacus

Know what an AI coding task will cost **before** you run it.

Before each task, your coding agent asks Token Abacus for a budget based on what similar tasks
cost other people. After the task, the real cost (read exactly from your local session log) is
recorded, so the next estimate is better.

```bash
npx token-abacus init
```

That adds the Token Abacus MCP server to Claude Code, Codex and Cursor (whichever you have) and
asks whether to contribute anonymized task data. Restart your coding tool and start a task:

> Estimate: ~$0.40 on claude-opus-5-5, budget 180k tokens, medium confidence.
> Based on 12 similar tasks. Cheaper option: claude-sonnet-5-5 at ~$0.21.

**What's uploaded** (only if you opt in): a one-sentence description of each task, the models
used, exact token counts and timestamps. **Never uploaded:** code, file names, prompts, or
anything that identifies you. Turn it off any time in `~/.token-abacus/config.json`.

## Commands

| Command | What it does |
|---|---|
| `npx token-abacus init` | Add the MCP server to your coding tools (`--dry-run` to preview) |
| `npx token-abacus import` | Turn your past Claude Code sessions into tasks with exact costs; previews first, `--upload` to contribute |
| `npx token-abacus status` | Show your settings |

---

## Development

Full design: [`docs/MCP.md`](../docs/MCP.md). This package is milestones 1–4 of that guide.

## Develop

```bash
cd cli
npm install
npm run build
npm test                 # unit + end-to-end (real MCP over stdio against a fake API), ~2 s
npm run inspect          # MCP Inspector UI against dist/cli.js mcp
```

Try it in Claude Code against the mock API (no backend needed):

```bash
claude mcp add token-abacus-dev -e TOKEN_ABACUS_API=mock -- node "$PWD/dist/cli.js" mcp
```

Then ask Claude Code for a small task. It should call `estimate_task` first and `submit_run` at
the end. Logs: `~/.token-abacus/debug.log`. Remove with `claude mcp remove token-abacus-dev`.

## Environment

| Variable | Purpose |
|---|---|
| `TOKEN_ABACUS_API` | API base URL; `mock` for canned responses. Default: the Supabase functions URL |
| `TOKEN_ABACUS_HOME` | State directory. Default `~/.token-abacus` |
| `CLAUDE_CONFIG_DIR` | Where Claude Code keeps transcripts. Default `~/.claude` |

## Layout

| File | Role |
|---|---|
| `src/cli.ts` | Entry point: `mcp`, `init` (stub), `status` |
| `src/mcp/server.ts` | MCP server, instructions, start-up housekeeping, shutdown handling |
| `src/mcp/tools.ts` | `estimate_task`, `submit_run` |
| `src/lifecycle.ts` | Closing a run: read usage → scrub → upload → forget |
| `src/runs.ts` | Open runs in `~/.token-abacus/state.json` |
| `src/api.ts` | `/estimate`, `/submit`, outbox retry, mock API |
| `src/harness/claude.ts` | Claude Code transcript reader (verified on real logs) |
| `src/harness/codex.ts` | **Stub** — milestone 8 |
| `src/scrub.ts` | Removes keys, emails, paths before upload |

## Status

| # | Milestone | State |
|---|---|---|
| 1 | Stdio server, both tools | ✅ |
| 2 | Claude Code transcript reader | ✅ matches an independent count on a real 10M-token session |
| 3 | Run lifecycle + state file | ✅ |
| 4 | Safety nets: next estimate, shutdown, killed process, outbox | ✅ covered by e2e tests |
| 5 | Real API | ✅ live — `npx tsx test/live-smoke.ts` runs estimate → submit against Supabase (writes one real row; delete it after) |
| 6 | Real use in Claude Code | next — try with `TOKEN_ABACUS_API=mock` now |
| 7 | `init` command | TODO (`src/cli.ts`) |
| 8 | Codex reader | TODO (`src/harness/codex.ts`) — needs a real rollout file |
| 9 | Publish to npm | TODO — the name `token-abacus` is free as of 2026-10-03 |
