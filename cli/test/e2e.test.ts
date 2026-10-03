import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { encodeCwd } from "../src/harness/claude.js";
import { append, tempDir, usageLine } from "./helpers.js";

// Drives the built server (dist/cli.js) over real stdio, as Claude Code would, against a fake API.
const CLI = resolve(import.meta.dirname, "..", "dist", "cli.js");

let api: Server;
let apiUrl: string;
const submits: any[] = [];

before(async () => {
  api = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/estimate") {
        res.end(JSON.stringify({
          recommendation: { model: "claude-sonnet-5-5", budget_tokens: 180000, budget_usd: 0.4, ceiling_tokens: 290000, ceiling_usd: 0.65 },
          confidence: "high",
          models: [{ model: "claude-sonnet-5-5", n: 31, success_rate: 0.9, p50_tokens: 120000, p85_tokens: 156000, p50_usd: 0.27, p85_usd: 0.35 }],
          similar_tasks: [{ title: "Nginx reverse proxy", model: "claude-sonnet-5-5", total_tokens: 140000, cost_usd: 0.31, similarity: 0.91 }],
        }));
      } else if (req.url === "/submit") {
        const payload = JSON.parse(body);
        submits.push(payload);
        res.end(JSON.stringify({ id: payload.run_id, cost_usd: 0.12, status: "recorded", flagged: false }));
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
  });
  await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
  apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
});

after(() => {
  api.closeAllConnections();     // keep-alive sockets would otherwise hold the test process open
  api.close();
});

interface Session {
  client: Client;
  transport: StdioClientTransport;
  transcript: string;
}

async function startSession(env: { home: string; claude: string; project: string; api?: string }): Promise<Session> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI, "mcp"],
    cwd: env.project,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      TOKEN_ABACUS_HOME: env.home,
      CLAUDE_CONFIG_DIR: env.claude,
      TOKEN_ABACUS_API: env.api ?? apiUrl,
    },
    stderr: "ignore",
  });
  const client = new Client({ name: "claude-code", version: "9.9.9" });
  await client.connect(transport);
  const transcript = join(env.claude, "projects", encodeCwd(env.project), "session-1.jsonl");
  return { client, transport, transcript };
}

function textOf(result: any): string {
  return result.content[0].text;
}

async function callEstimate(session: Session, task: string): Promise<string> {
  const result: any = await session.client.callTool({ name: "estimate_task", arguments: { task } });
  return result.structuredContent.run_id;
}

async function waitFor<T>(find: () => T | undefined, ms = 5000): Promise<T> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const found = find();
    if (found) return found;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timed out waiting for condition");
}

function setup() {
  const project = tempDir("project");
  const claude = tempDir("claude");
  const home = tempDir("home");
  // The session transcript exists before the task starts, as it does in a real session.
  append(join(claude, "projects", encodeCwd(project), "session-1.jsonl"),
    JSON.stringify({ type: "user", cwd: project, timestamp: new Date().toISOString() }));
  return { project, claude, home };
}

test("server advertises instructions and both tools", async () => {
  const session = await startSession(setup());
  const { tools } = await session.client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["estimate_task", "submit_run"]);
  assert.match(session.client.getInstructions() ?? "", /call estimate_task/);
  await session.client.close();
});

test("estimate → work → submit uploads exact tokens from the transcript", async () => {
  const session = await startSession(setup());
  const runId = await callEstimate(session, "Set up Caddy reverse proxy with TLS for a Next.js app");

  // The agent works: Claude Code appends usage lines (one repeated, as in real logs).
  const now = new Date();
  append(session.transcript,
    usageLine({ requestId: "r1", time: now, input: 100, output: 2000, cacheRead: 50000, cacheWrite: 3000 }),
    usageLine({ requestId: "r1", time: now, input: 100, output: 2000, cacheRead: 50000, cacheWrite: 3000 }),
    usageLine({ requestId: "r2", time: now, input: 50, output: 1000, cacheRead: 60000 }),
  );

  const result = await session.client.callTool({
    name: "submit_run",
    arguments: { run_id: runId, outcome: "success", summary: "Configured Caddy reverse proxy with automatic TLS" },
  });
  assert.match(textOf(result), /^Recorded: 116k tokens, \$0\.12 on claude-sonnet-5-5 \(estimate was \$0\.40\)\.$/);

  const payload = submits.find((s) => s.run_id === runId);
  assert.equal(payload.harness, "claude-code");
  assert.equal(payload.client_version, "9.9.9");
  assert.equal(payload.outcome, "success");
  assert.equal(payload.token_source, "transcript");
  assert.deepEqual(payload.models, [{
    model: "claude-sonnet-5-5", input_tokens: 150, output_tokens: 3000, cache_read_tokens: 110000, cache_write_tokens: 3000,
  }]);
  await session.client.close();
});

test("a forgotten submit is closed by the next estimate", async () => {
  const session = await startSession(setup());
  const first = await callEstimate(session, "Add a login page with email magic links");
  append(session.transcript, usageLine({ requestId: "f1", time: new Date(), output: 500 }));
  await callEstimate(session, "Write unit tests for the login page");

  const payload = submits.find((s) => s.run_id === first);
  assert.equal(payload.outcome, "unknown");
  assert.equal(payload.models[0].output_tokens, 500);
  await session.client.close();
});

test("closing the session uploads the open run", async () => {
  const session = await startSession(setup());
  const runId = await callEstimate(session, "Migrate the settings page to server components");
  append(session.transcript, usageLine({ requestId: "c1", time: new Date(), output: 700 }));
  await session.client.close();

  const payload = await waitFor(() => submits.find((s) => s.run_id === runId));
  assert.equal(payload.outcome, "unknown");
  assert.equal(payload.models[0].output_tokens, 700);
});

test("a killed server's run is uploaded by the next session", async () => {
  const env = setup();
  const first = await startSession(env);
  const runId = await callEstimate(first, "Add Stripe checkout to the pricing page");
  append(first.transcript, usageLine({ requestId: "k1", time: new Date(), output: 900 }));
  process.kill(first.transport.pid!, "SIGKILL");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(submits.find((s) => s.run_id === runId), undefined);

  const second = await startSession(env);
  const payload = await waitFor(() => submits.find((s) => s.run_id === runId));
  assert.equal(payload.models[0].output_tokens, 900);
  await second.client.close();
});

test("API down: estimate degrades quickly, submit is queued and retried on next start", async () => {
  const env = setup();
  const down = await startSession({ ...env, api: "http://127.0.0.1:9" });   // nothing listens on port 9
  const started = Date.now();
  const result = await down.client.callTool({ name: "estimate_task", arguments: { task: "Add dark mode toggle to the navbar" } });
  assert.ok(Date.now() - started < 4000);
  assert.match(textOf(result), /^No estimate available yet/);
  const runId = (result as any).structuredContent.run_id;

  append(down.transcript, usageLine({ requestId: "d1", time: new Date(), output: 300 }));
  const submitted = await down.client.callTool({
    name: "submit_run", arguments: { run_id: runId, outcome: "success", summary: "Added a dark mode toggle" },
  });
  assert.match(textOf(submitted), /^Upload queued for retry: /);
  await down.client.close();

  const up = await startSession(env);
  const payload = await waitFor(() => submits.find((s) => s.run_id === runId));
  assert.equal(payload.models[0].output_tokens, 300);
  await up.client.close();
});

test("secrets in task and summary are scrubbed before upload", async () => {
  const session = await startSession(setup());
  const runId = await callEstimate(session, "Rotate key sk-ant-api03-abcdefghijklmnopqrstuv for ops@acme.io");
  await session.client.callTool({
    name: "submit_run",
    arguments: { run_id: runId, outcome: "success", summary: "Rotated key in /Users/bob/app/.env" },
  });
  const payload = submits.find((s) => s.run_id === runId);
  assert.equal(payload.task, "Rotate key [key] for [email]");
  assert.equal(payload.summary, "Rotated key in [path]");
  await session.client.close();
});
