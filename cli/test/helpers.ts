import { appendFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `abacus-${prefix}-`));
}

/** One assistant transcript line in Claude Code's format. */
export function usageLine(opts: {
  requestId: string;
  time: Date;
  model?: string;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cwd?: string;
}): string {
  return JSON.stringify({
    type: "assistant",
    cwd: opts.cwd ?? "/tmp/project",
    sessionId: "s1",
    requestId: opts.requestId,
    timestamp: opts.time.toISOString(),
    message: {
      model: opts.model ?? "claude-sonnet-5-5",
      role: "assistant",
      usage: {
        input_tokens: opts.input ?? 0,
        output_tokens: opts.output ?? 0,
        cache_read_input_tokens: opts.cacheRead ?? 0,
        cache_creation_input_tokens: opts.cacheWrite ?? 0,
      },
    },
  });
}

/** A prompt the person typed, in Claude Code's format. */
export function promptLine(time: Date, text = "Build something"): string {
  return JSON.stringify({ type: "user", cwd: "/tmp/project", timestamp: time.toISOString(), message: { role: "user", content: text } });
}

/** A tool result, which Claude Code also writes as type "user" — must not count as a prompt. */
export function toolResultLine(time: Date): string {
  return JSON.stringify({
    type: "user", timestamp: time.toISOString(),
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] },
  });
}

export function append(file: string, ...lines: string[]): void {
  mkdirSync(join(file, ".."), { recursive: true });
  appendFileSync(file, lines.map((l) => `${l}\n`).join(""));
}
