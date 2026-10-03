import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { loadConfig, saveConfig } from "./config.js";

// `token-abacus init`: add the local MCP server to every coding tool found on this machine and ask
// whether to contribute anonymized task data. Idempotent: running it again changes nothing that is
// already set up. `--yes` accepts the defaults (contribute on); `--dry-run` prints what it would do.

const SERVER_ARGS = ["-y", "token-abacus@latest", "mcp"];

export interface InitOptions {
  yes?: boolean;
  dryRun?: boolean;
  /** For tests: where to look for ~/.codex and ~/.cursor. */
  home?: string;
  /** For tests: skip running the `claude` CLI. */
  skipClaude?: boolean;
}

interface Step {
  tool: string;
  status: "added" | "already set up" | "not installed" | "failed" | "would add";
  detail?: string;
  undo?: string;
}

export async function runInit(options: InitOptions = {}): Promise<Step[]> {
  const home = options.home ?? homedir();
  const steps: Step[] = [];

  steps.push(options.skipClaude ? { tool: "Claude Code", status: "not installed" } : claudeCode(options.dryRun));
  steps.push(codex(join(home, ".codex"), options.dryRun));
  steps.push(cursor(join(home, ".cursor"), options.dryRun));

  const config = loadConfig();
  if (!options.dryRun) {
    config.contribute = options.yes ? true : await askContribute();
    saveConfig(config);
  }

  console.log("\nToken Abacus");
  for (const s of steps) {
    console.log(`  ${s.tool.padEnd(12)} ${s.status}${s.detail ? ` — ${s.detail}` : ""}`);
  }
  console.log(`\n  Contribute task data: ${options.dryRun ? "(not changed in dry run)" : config.contribute ? "yes" : "no"}`);
  console.log("  Change it any time in ~/.token-abacus/config.json (\"contribute\": true/false).");
  const undo = steps.filter((s) => s.undo && s.status === "added");
  if (undo.length) {
    console.log("\n  To undo:");
    for (const s of undo) console.log(`    ${s.tool}: ${s.undo}`);
  }
  if (steps.some((s) => s.status === "added")) {
    console.log("\n  Restart your coding tool, then start a task. The agent will show an estimate first.");
  }
  return steps;
}

async function askContribute(): Promise<boolean> {
  if (!process.stdin.isTTY) return true;
  console.log(`
When a task finishes, Token Abacus can upload, to improve everyone's estimates:
  - a one-sentence description of the task and what was done (secrets, emails and paths removed)
  - which models were used and their exact token counts
  - timestamps and which coding tool ran it
Never uploaded: code, file names or contents, your prompts, or anything that identifies you.`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Contribute anonymized task data? [Y/n] ")).trim().toLowerCase();
  rl.close();
  return answer === "" || answer === "y" || answer === "yes";
}

function claudeCode(dryRun?: boolean): Step {
  const tool = "Claude Code";
  const run = (args: string[]) => execFileSync("claude", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    run(["--version"]);
  } catch {
    return { tool, status: "not installed" };
  }
  const undo = "claude mcp remove token-abacus -s user";
  try {
    run(["mcp", "get", "token-abacus"]);
    return { tool, status: "already set up", undo };
  } catch {
    // not configured yet
  }
  if (dryRun) return { tool, status: "would add", detail: `claude mcp add --scope user token-abacus -- npx ${SERVER_ARGS.join(" ")}` };
  try {
    run(["mcp", "add", "--scope", "user", "token-abacus", "--", "npx", ...SERVER_ARGS]);
    return { tool, status: "added", undo };
  } catch (e) {
    return { tool, status: "failed", detail: (e as Error).message.split("\n")[0] };
  }
}

function codex(dir: string, dryRun?: boolean): Step {
  const tool = "Codex";
  if (!existsSync(dir)) return { tool, status: "not installed" };
  const path = join(dir, "config.toml");
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const undo = `remove the [mcp_servers.token-abacus] section from ${path}`;
  if (/^\s*\[mcp_servers\.(token-abacus|"token-abacus")\]/m.test(current)) return { tool, status: "already set up", undo };
  if (dryRun) return { tool, status: "would add", detail: `[mcp_servers.token-abacus] in ${path}` };
  const block = [
    "",
    "# Added by `token-abacus init`: cost estimates before tasks, exact costs after.",
    "[mcp_servers.token-abacus]",
    'command = "npx"',
    `args = [${SERVER_ARGS.map((a) => JSON.stringify(a)).join(", ")}]`,
    "",
  ].join("\n");
  try {
    writeFileSync(path, current.replace(/\n*$/, "\n") + block);
    return { tool, status: "added", undo };
  } catch (e) {
    return { tool, status: "failed", detail: (e as Error).message };
  }
}

function cursor(dir: string, dryRun?: boolean): Step {
  const tool = "Cursor";
  if (!existsSync(dir)) return { tool, status: "not installed" };
  const path = join(dir, "mcp.json");
  let config: { mcpServers?: Record<string, unknown> } = {};
  if (existsSync(path)) {
    try {
      config = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return { tool, status: "failed", detail: `${path} isn't valid JSON; not touching it` };
    }
  }
  const undo = `remove "token-abacus" from mcpServers in ${path}`;
  if (config.mcpServers?.["token-abacus"]) return { tool, status: "already set up", undo };
  if (dryRun) return { tool, status: "would add", detail: `mcpServers["token-abacus"] in ${path}` };
  config.mcpServers = { ...(config.mcpServers ?? {}), "token-abacus": { command: "npx", args: SERVER_ARGS } };
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
    return { tool, status: "added", undo };
  } catch (e) {
    return { tool, status: "failed", detail: (e as Error).message };
  }
}
