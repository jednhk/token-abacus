import type { ModelUsage } from "../api.js";
import * as claude from "./claude.js";
import * as codex from "./codex.js";

export type Harness = "claude-code" | "codex" | "other";

/** Map the MCP client's self-reported name (from initialize) to a harness. */
export function detectHarness(clientName: string | undefined): Harness {
  const name = (clientName ?? "").toLowerCase();
  if (name.includes("claude-code") || name.includes("claude code")) return "claude-code";
  if (name.includes("codex")) return "codex";
  if (!name && process.env.CLAUDECODE === "1") return "claude-code";
  return "other";
}

/** Locate the session log for this harness and project, or null if it can't be read. */
export async function findLog(harness: Harness, cwd: string): Promise<string | null> {
  if (harness === "claude-code") return claude.findSessionFile(cwd);
  if (harness === "codex") return codex.findSessionFile(cwd);
  return null;
}

/** Exact usage between start and end, or null when this harness has no readable log. */
export async function usageBetween(harness: Harness, logFile: string | null, start: number, end: number): Promise<ModelUsage[] | null> {
  if (!logFile) return null;
  if (harness === "claude-code") return claude.readUsage(claude.sessionFiles(logFile), start, end);
  if (harness === "codex") {
    const usage = await codex.readUsage(logFile, start, end);
    return usage.length ? usage : null;
  }
  return null;
}
