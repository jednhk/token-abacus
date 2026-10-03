// Live smoke test: the built MCP server against the deployed Supabase functions.
// Not part of `npm test` (it writes a real row). Run: npx tsx test/live-smoke.ts
// Prints the run_id it created so the row can be deleted afterwards.
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { encodeCwd } from "../src/harness/claude.js";
import { append, tempDir, usageLine } from "./helpers.js";

const project = tempDir("live-project");
const claude = tempDir("live-claude");
const transcript = join(claude, "projects", encodeCwd(project), "session-live.jsonl");
append(transcript, JSON.stringify({ type: "user", cwd: project, timestamp: new Date().toISOString() }));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(import.meta.dirname, "..", "dist", "cli.js"), "mcp"],
  cwd: project,
  env: {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    TOKEN_ABACUS_HOME: tempDir("live-home"),
    CLAUDE_CONFIG_DIR: claude,
  },
  stderr: "ignore",
});
const client = new Client({ name: "claude-code", version: "live-smoke" });
await client.connect(transport);

const estimate: any = await client.callTool({
  name: "estimate_task",
  arguments: { task: "Fix a Django bug where a DecimalField lookup crashes on SQLite" },
});
console.log("estimate_task →", estimate.content[0].text);
const runId = estimate.structuredContent.run_id;

const now = new Date();
append(transcript,
  usageLine({ requestId: "live-1", time: now, model: "claude-sonnet-4-5", input: 1200, output: 6000, cacheRead: 180000, cacheWrite: 9000 }),
  usageLine({ requestId: "live-2", time: now, model: "claude-haiku-4-5", input: 300, output: 1500, cacheRead: 40000 }),
);

const submitted: any = await client.callTool({
  name: "submit_run",
  arguments: { run_id: runId, outcome: "success", summary: "Fixed DecimalField lookup on SQLite and added a regression test" },
});
console.log("submit_run →", submitted.content[0].text);
console.log("run_id", runId);
await client.close();
