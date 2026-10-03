import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.131.0/helpers/zod";
import { z } from "npm:zod@4.6.5";

// One definition of task kind / size / stack, used everywhere: the MCP tool asks the agent with
// these words, the tag-tasks job tags stored tasks with them, and the estimate tags website queries
// with them. Matching is only as good as this definition is consistent.

export const KINDS = ["new_app", "feature", "bugfix", "refactor", "infra", "docs", "data", "test", "research", "other"] as const;
export const SIZES = ["small", "medium", "large"] as const;
export type Size = typeof SIZES[number];

export const SIZE_GUIDE = `Size is the amount of work, not the topic:
- small: one focused change, script, or single-page/single-file app; a few files; usually under an hour of agent work.
- medium: a multi-file feature, or a small full-stack app (frontend + backend + database) with a handful of parts.
- large: multiple services or apps, infrastructure-as-code or cloud deployment, mobile + backend, or many features/screens; usually several hours.`;

export const TAG_GUIDE = `${SIZE_GUIDE}
Kind is one of: ${KINDS.join(", ")} (new_app = building something from scratch).
Stack is the main technologies, lowercase, most important first, at most 8 (e.g. ["node", "express", "socket.io", "sqlite"]). Empty if unknown.`;

export const TagSchema = z.object({
  work_kind: z.enum(KINDS),
  size: z.enum(SIZES),
  stack: z.array(z.string()),
});
export type Tags = z.infer<typeof TagSchema>;

export const TAG_MODEL = "claude-haiku-4-5";

let client: Anthropic | null = null;
export function anthropic(): Anthropic | null {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return null;
  client ??= new Anthropic({ apiKey: key });
  return client;
}

const BatchSchema = z.object({
  tasks: z.array(TagSchema.extend({ id: z.number().int() })),
});

/** Tag several task descriptions in one call. Returns tags by index; missing entries mean "couldn't tag". */
export async function tagTasks(descriptions: string[]): Promise<Map<number, Tags>> {
  const api = anthropic();
  if (!api) throw new Error("ANTHROPIC_API_KEY is not set");
  const items = descriptions.map((task, id) => ({ id, task: task.slice(0, 600) }));
  const response = await api.messages.parse({
    model: TAG_MODEL,
    max_tokens: 16000,
    system: `You classify software tasks that an AI coding agent was asked to do.\n${TAG_GUIDE}\nJudge only from the description. Return one entry per input id.`,
    messages: [{ role: "user", content: JSON.stringify(items) }],
    output_config: { format: zodOutputFormat(BatchSchema) },
  });
  const out = new Map<number, Tags>();
  for (const t of response.parsed_output?.tasks ?? []) {
    if (t.id >= 0 && t.id < descriptions.length) {
      out.set(t.id, { work_kind: t.work_kind, size: t.size, stack: normalizeStack(t.stack) });
    }
  }
  return out;
}

export function normalizeStack(stack: unknown): string[] {
  if (!Array.isArray(stack)) return [];
  return [...new Set(stack.filter((s): s is string => typeof s === "string")
    .map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
}
