import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { encodeCwd, findSessionFile, readUsage, sessionFiles } from "../src/harness/claude.js";
import { scrub } from "../src/scrub.js";
import { append, tempDir, usageLine } from "./helpers.js";

test("encodeCwd matches Claude Code's project folder naming", () => {
  assert.equal(encodeCwd("/Users/co-one/Documents/GitHub/rote"), "-Users-co-one-Documents-GitHub-rote");
  assert.equal(encodeCwd("/tmp/my.app_v2"), "-tmp-my-app-v2");
});

test("readUsage counts each requestId once, includes subagents, respects the time window", async () => {
  const root = tempDir("claude");
  const session = join(root, "session.jsonl");
  const base = Date.now() - 60 * 60_000;     // files are written "now", so the window must be in the past
  const t = (min: number) => new Date(base + min * 60_000);

  append(session,
    usageLine({ requestId: "before", time: t(0), output: 999 }),                 // before start
    usageLine({ requestId: "r1", time: t(5), input: 10, output: 100, cacheRead: 1000 }),
    usageLine({ requestId: "r1", time: t(5), input: 10, output: 100, cacheRead: 1000 }), // repeat line
    usageLine({ requestId: "r2", time: t(6), input: 20, output: 200, cacheWrite: 50 }),
    usageLine({ requestId: "r3", time: t(7), model: "claude-haiku-4-5", output: 5 }),
    "not json",
    JSON.stringify({ type: "user", timestamp: t(6).toISOString(), message: { role: "user", content: "hi" } }),
    usageLine({ requestId: "after", time: t(30), output: 999 }),                 // after end
  );
  append(join(root, "session", "subagents", "agent-a.jsonl"),
    usageLine({ requestId: "sub1", time: t(8), input: 1, output: 40 }),
  );

  const files = sessionFiles(session);
  assert.equal(files.length, 2);
  const usage = await readUsage(files, t(1).getTime(), t(20).getTime());

  assert.deepEqual(usage, [
    { model: "claude-sonnet-5-5", input_tokens: 31, output_tokens: 340, cache_read_tokens: 1000, cache_write_tokens: 50 },
    { model: "claude-haiku-4-5", input_tokens: 0, output_tokens: 5, cache_read_tokens: 0, cache_write_tokens: 0 },
  ]);
});

test("findSessionFile picks the newest transcript in the project folder", async () => {
  const config = tempDir("cfg");
  process.env.CLAUDE_CONFIG_DIR = config;
  const dir = join(config, "projects", encodeCwd("/work/app"));
  append(join(dir, "old.jsonl"), usageLine({ requestId: "a", time: new Date() }));
  await new Promise((r) => setTimeout(r, 20));
  append(join(dir, "new.jsonl"), usageLine({ requestId: "b", time: new Date() }));
  assert.equal(await findSessionFile("/work/app"), join(dir, "new.jsonl"));
  delete process.env.CLAUDE_CONFIG_DIR;
});

test("scrub removes secrets, emails and paths", () => {
  const out = scrub("Set key sk-ant-api03-abcdefghijklmnopqrstuv for bob@example.com in /Users/bob/app/.env");
  assert.equal(out, "Set key [key] for [email] in [path]");
  assert.ok(scrub("x".repeat(500)).length <= 300);
});
