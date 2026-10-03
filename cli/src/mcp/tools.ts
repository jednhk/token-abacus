import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { estimate, type EstimateResponse } from "../api.js";
import { detectHarness, findLog } from "../harness/detect.js";
import { finalizeRun, formatTokens, formatUsd, nextFloor, submitRun, totalTokens } from "../lifecycle.js";
import { getRun, ownRuns, saveRun, type Run } from "../runs.js";

const ESTIMATE_DESCRIPTION =
  "Get a cost and token-budget estimate for a coding task before starting it. Call this once at the " +
  "start of each distinct task the user asks for. Describe the task in one specific sentence (what + " +
  "stack), not the user's raw words. Skip it for questions and trivial one-step edits.";

const SUBMIT_DESCRIPTION =
  "Record a finished task so future estimates improve. Call this when the task you estimated is " +
  "complete (or abandoned), with the run_id from estimate_task. Token counts are read automatically " +
  "from the session log; do not include them.";

function text(value: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: value }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

function describeEstimate(runId: string, result: EstimateResponse | null): string {
  const close = `Call submit_run with run_id ${runId} when this task is done.`;
  if (!result?.recommendation) {
    return `No estimate available yet for this task (run_id ${runId}). Start the task. ${close}`;
  }
  const r = result.recommendation;
  const n = result.models.find((m) => m.model === r.model)?.n ?? 0;
  const example = result.similar_tasks[0] ? `, e.g. "${result.similar_tasks[0].title}"` : "";
  return [
    `Estimate (run_id ${runId}): ~${formatUsd(r.budget_usd)} on ${r.model}, budget ${formatTokens(r.budget_tokens)} tokens ` +
      `(ceiling ${formatTokens(r.ceiling_tokens)}), ${result.confidence} confidence.`,
    `Based on ${n} similar task${n === 1 ? "" : "s"}${example}.`,
    `Tell the user the estimate in one line, then start. ${close}`,
  ].join("\n");
}

export function registerTools(server: McpServer): void {
  const client = () => server.server.getClientVersion();

  server.registerTool(
    "estimate_task",
    {
      title: "Estimate task cost",
      description: ESTIMATE_DESCRIPTION,
      inputSchema: {
        task: z.string().min(10).max(300)
          .describe("One specific sentence: what will be built or changed, and the stack."),
        model: z.string().optional().describe("The model you are running as, if known."),
        cwd: z.string().optional()
          .describe("Absolute path of the project directory. Used locally only, never uploaded."),
      },
    },
    async ({ task, model, cwd }) => {
      // A new task ends the previous one: give it its final count, bounded so it can't absorb this
      // task. If the agent never called submit_run, it goes up with outcome "unknown".
      const now = Date.now();
      for (const previous of ownRuns()) {
        await finalizeRun(previous, { owned: true, upperBound: now });
      }

      const harness = detectHarness(client()?.name);
      const projectDir = cwd ?? process.cwd();
      const run: Run = {
        run_id: randomUUID(),
        task,
        model,
        harness,
        client_version: client()?.version,
        cwd: projectDir,
        log_file: await findLog(harness, projectDir),
        started_at: new Date(now).toISOString(),
        pid: process.pid,
        floor: nextFloor(),
      };
      saveRun(run);

      const result = await estimate({ prompt: task, model, harness });
      if (result?.recommendation) saveRun({ ...run, estimate_usd: result.recommendation.budget_usd });
      return text(describeEstimate(run.run_id, result), { run_id: run.run_id, estimate: result });
    },
  );

  server.registerTool(
    "submit_run",
    {
      title: "Record finished task",
      description: SUBMIT_DESCRIPTION,
      inputSchema: {
        run_id: z.string().describe("The run_id returned by estimate_task."),
        outcome: z.enum(["success", "partial", "failed", "abandoned"]),
        summary: z.string().min(5).max(300)
          .describe("One sentence on what was actually done. No secrets, file contents, or personal names."),
      },
    },
    async ({ run_id, outcome, summary }) => {
      const run = getRun(run_id);
      if (!run) {
        return text(`Unknown run_id ${run_id} (already submitted or never estimated). Nothing recorded.`);
      }
      // A run from a server process that has since exited can't be recounted later: finish it now.
      const result = run.pid === process.pid
        ? await submitRun(run, outcome, summary)
        : await finalizeRun({ ...run, outcome, summary, ended_at: new Date().toISOString() }, { owned: false });

      const status = !result.contributed ? "Not uploaded (contribution is off)"
        : result.response ? "Recorded" : "Upload queued for retry";
      let detail = "no token counts (this tool's session log isn't readable yet)";
      if (result.usage?.length) {
        const cost = result.response?.cost_usd;
        const costText = cost != null ? `, ${formatUsd(cost)}` : "";
        const vsEstimate = run.estimate_usd !== undefined ? ` (estimate was ${formatUsd(run.estimate_usd)})` : "";
        detail = `${formatTokens(totalTokens(result.usage))} tokens${costText} so far on ${result.usage[0].model}${vsEstimate}`;
      }
      // This call, and the reply after it, aren't in the session log yet; the final recount adds them.
      const note = run.pid === process.pid
        ? " The final count, including this step and your reply, is uploaded after this turn — " +
          "if you mention the cost, call it approximate."
        : "";
      return text(`${status}: ${detail}.${note}`, { run_id, usage: result.usage, response: result.response });
    },
  );
}
