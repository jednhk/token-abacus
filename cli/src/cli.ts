#!/usr/bin/env node
import { loadConfig, VERSION } from "./config.js";
import { runMcpServer } from "./mcp/server.js";

const USAGE = `token-abacus ${VERSION}

Usage:
  token-abacus mcp      Run the local MCP server (started by your coding tool)
  token-abacus init     Add Token Abacus to your coding tools
  token-abacus status   Show install id, contribution setting and API

Add to Claude Code manually:
  claude mcp add --scope user token-abacus -- npx -y token-abacus@latest mcp`;

async function main(): Promise<void> {
  const command = process.argv[2];
  switch (command) {
    case "mcp":
      await runMcpServer();
      break;
    case "init":
      // TODO(MCP teammate, milestone 7): detect tools, ask for consent, write their MCP configs.
      loadConfig();
      console.log("init is not implemented yet. For now:\n");
      console.log("  claude mcp add --scope user token-abacus -- npx -y token-abacus@latest mcp");
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
