import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { flushOutbox } from "../api.js";
import { log, VERSION } from "../config.js";
import { finalizeRun } from "../lifecycle.js";
import { orphanedRuns, ownRuns } from "../runs.js";
import { registerTools } from "./tools.js";

const INSTRUCTIONS = `Token Abacus estimates what coding tasks cost, from real past tasks.
- At the START of each distinct task the user asks for, call estimate_task with a one-sentence task description, and tell the user the estimate in one line.
- When that task is DONE (or abandoned), call submit_run with the run_id and a one-sentence summary.
- One task = one estimate_task + one submit_run. A new request from the user is a new task.
- Skip both for questions, explanations, and trivial one-step edits.
- Never send secrets, file contents, or personal names in task or summary.`;

const SHUTDOWN_BUDGET_MS = 2_000;

export async function runMcpServer(): Promise<void> {
  const server = new McpServer({ name: "token-abacus", version: VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server);

  server.server.oninitialized = () => {
    const client = server.server.getClientVersion();
    log(`connected: client=${client?.name}@${client?.version} cwd=${process.cwd()}`);
  };

  installShutdown();
  await server.connect(new StdioServerTransport());
  void housekeeping();
}

/** Upload what earlier sessions left behind: queued payloads and runs whose process died. */
async function housekeeping(): Promise<void> {
  try {
    await flushOutbox();
    for (const run of orphanedRuns()) {
      log(`closing orphaned run ${run.run_id} from pid ${run.pid}`);
      await finalizeRun(run, { owned: false });
    }
  } catch (error) {
    log(`housekeeping failed: ${error}`);
  }
}

/**
 * The client ends a session by closing stdin or by signalling. Close this process's open run
 * within a short budget; anything unfinished stays in state.json and is uploaded on the next start.
 */
function installShutdown(): void {
  let shuttingDown = false;
  const shutdown = async (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`shutting down (${reason})`);
    const closing = Promise.all(
      ownRuns().map((run) => finalizeRun(run, { owned: true, timeoutMs: SHUTDOWN_BUDGET_MS })),
    );
    await Promise.race([closing, new Promise((resolve) => setTimeout(resolve, SHUTDOWN_BUDGET_MS))]);
    process.exit(0);
  };
  process.stdin.on("end", () => void shutdown("stdin closed"));
  process.stdin.on("close", () => void shutdown("stdin closed"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
