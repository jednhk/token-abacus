# token-abacus (CLI + local MCP server)

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
| 5 | Real API | waiting on `estimate` / `submit` functions (Shah) |
| 6 | Real use in Claude Code | next — try with `TOKEN_ABACUS_API=mock` now |
| 7 | `init` command | TODO (`src/cli.ts`) |
| 8 | Codex reader | TODO (`src/harness/codex.ts`) — needs a real rollout file |
| 9 | Publish to npm | TODO — the name `token-abacus` is free as of 2026-10-03 |
