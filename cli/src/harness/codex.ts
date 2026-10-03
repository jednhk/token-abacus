import type { ModelUsage } from "../api.js";

// TODO(MCP teammate, milestone 8): Codex rollout reader.
// Expected layout (unverified — check against a real file first):
//   ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
//   `event_msg` entries of type `token_count` with CUMULATIVE totals
//   (input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens),
//   `turn_context` entries carrying the model.
// Usage for a run = cumulative total at `end` minus cumulative total at `start`.

export async function findSessionFile(_cwd: string): Promise<string | null> {
  return null;
}

export async function readUsage(_file: string, _start: number, _end: number): Promise<ModelUsage[]> {
  return [];
}
