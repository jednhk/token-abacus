import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runInit } from "../src/init.js";
import { tempDir } from "./helpers.js";

test("init adds Codex and Cursor configs, keeps existing entries, and is idempotent", async () => {
  process.env.TOKEN_ABACUS_HOME = tempDir("init-state");
  const home = tempDir("init-home");
  mkdirSync(join(home, ".codex"));
  writeFileSync(join(home, ".codex", "config.toml"), 'model = "gpt-5.2"\n\n[mcp_servers.other]\ncommand = "other"\n');
  mkdirSync(join(home, ".cursor"));
  writeFileSync(join(home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));

  const first = await runInit({ home, yes: true, skipClaude: true });
  assert.deepEqual(first.map((s) => [s.tool, s.status]), [
    ["Claude Code", "not installed"], ["Codex", "added"], ["Cursor", "added"],
  ]);

  const toml = readFileSync(join(home, ".codex", "config.toml"), "utf8");
  assert.match(toml, /\[mcp_servers\.other\]/);                                   // untouched
  assert.match(toml, /\[mcp_servers\.token-abacus\]\ncommand = "npx"\nargs = \["-y", "token-abacus@latest", "mcp"\]/);
  const cursor = JSON.parse(readFileSync(join(home, ".cursor", "mcp.json"), "utf8"));
  assert.deepEqual(Object.keys(cursor.mcpServers), ["other", "token-abacus"]);
  assert.deepEqual(cursor.mcpServers["token-abacus"], { command: "npx", args: ["-y", "token-abacus@latest", "mcp"] });

  const second = await runInit({ home, yes: true, skipClaude: true });
  assert.deepEqual(second.map((s) => s.status), ["not installed", "already set up", "already set up"]);
  assert.equal(readFileSync(join(home, ".codex", "config.toml"), "utf8"), toml);  // no duplicate block
});

test("init skips tools that aren't installed and never edits invalid JSON", async () => {
  process.env.TOKEN_ABACUS_HOME = tempDir("init-state2");
  const home = tempDir("init-home2");
  mkdirSync(join(home, ".cursor"));
  writeFileSync(join(home, ".cursor", "mcp.json"), "{ not json");
  const steps = await runInit({ home, yes: true, skipClaude: true });
  assert.deepEqual(steps.map((s) => s.status), ["not installed", "not installed", "failed"]);
  assert.equal(readFileSync(join(home, ".cursor", "mcp.json"), "utf8"), "{ not json");
});

test("dry run changes nothing", async () => {
  process.env.TOKEN_ABACUS_HOME = tempDir("init-state3");
  const home = tempDir("init-home3");
  mkdirSync(join(home, ".codex"));
  const steps = await runInit({ home, dryRun: true, skipClaude: true });
  assert.equal(steps[1].status, "would add");
  assert.throws(() => readFileSync(join(home, ".codex", "config.toml")));
});
