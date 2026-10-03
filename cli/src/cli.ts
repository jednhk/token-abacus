#!/usr/bin/env node
import { loadConfig, VERSION } from "./config.js";
import { runImport } from "./import.js";
import { runInit } from "./init.js";
import { runMcpServer } from "./mcp/server.js";

const USAGE = `token-abacus ${VERSION}

Usage:
  token-abacus init [--yes] [--dry-run]   Add Token Abacus to Claude Code, Codex and Cursor
  token-abacus import [--days N] [--upload] [--limit N]
                                          Turn past Claude Code sessions into tasks with exact
                                          costs; previews unless --upload is given
  token-abacus status                     Show install id, contribution setting and API
  token-abacus mcp                        Run the local MCP server (started by your coding tool)`;

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function option(name: string): number | undefined {
  const i = process.argv.indexOf(name);
  const value = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  switch (command) {
    case "mcp":
      await runMcpServer();
      break;
    case "init":
      await runInit({ yes: flag("--yes"), dryRun: flag("--dry-run") });
      break;
    case "import":
      await runImport({ days: option("--days"), limit: option("--limit"), upload: flag("--upload") });
      break;
    case "status": {
      const config = loadConfig();
      console.log(`install_id  ${config.install_id}`);
      console.log(`contribute  ${config.contribute}`);
      console.log(`api         ${process.env.TOKEN_ABACUS_API ?? config.api ?? "default"}`);
      break;
    }
    default:
      console.log(USAGE);
      process.exitCode = command && command !== "help" && command !== "--help" ? 1 : 0;
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
