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

export function append(file: string, ...lines: string[]): void {
  mkdirSync(join(file, ".."), { recursive: true });
  appendFileSync(file, lines.map((l) => `${l}\n`).join(""));
}
