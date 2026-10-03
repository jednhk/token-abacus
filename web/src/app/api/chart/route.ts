import { formatTokens } from "@/lib/format";
import type { DemoAnswer, SolutionPoint } from "@/lib/demo-answer";

export async function POST(request: Request) {
  let prompt = "";
  let answers: string[] = [];
  try {
    const body = (await request.json()) as { prompt?: unknown; answers?: unknown };
    prompt = String(body.prompt ?? "").trim().slice(0, 6000);
    if (Array.isArray(body.answers)) {
      answers = body.answers
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .slice(0, 6);
    }
  } catch {
    prompt = "";
  }
  if (!prompt) return Response.json({ error: "Missing prompt." }, { status: 400 });

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return Response.json({ error: "Chart model is not configured." }, { status: 503 });

  const scope = answers.length ? `\n\nScope answers:\n${answers.map((item) => `- ${item}`).join("\n")}` : "";
  const messages = [
    {
      role: "developer",
      content: `You estimate tokens for one coding-agent run. Reply with JSON only, in this shape:
{"prose":"two sentences","models":[{"name":"Haiku","input":0,"output":0,"recommended":false}],"optimizations":[{"name":"Keep one file","input":0,"output":0,"recommended":false}]}
Use exactly these model names: Haiku, Sonnet, Opus, GPT-5. Exactly four models and four optimizations. Mark exactly one model and one optimization recommended. That recommended pair is the lean path that can still finish this task.
input is context plus the prompt. output is what the agent writes. output is smaller than input.
Scale both charts to this task. A one-file page is often under 80k total on the lean model. A long spec or a multi-file change is larger. A whole-repo pass can reach the hundreds of thousands.
The four model totals must differ: the heaviest model is at least twice the lean model. Optimization rows are full runs of the same task with context added or cut, so they should sit in the same range as the models. The lean optimization is near the lean model. The fullest optimization is near the heaviest model, and at least three times the lean optimization.
Optimization names are short and specific to this task. Do not reuse the example name.
The prose is two sentences about the lean path and names its token total. Use token amounts, not dollar prices. Do not say the chart is a demo, a guess, or a mock.`,
    },
    { role: "user", content: `Task:\n${prompt}${scope}` },
  ];

  const jsonMode = { response_format: { type: "json_object" } };
  const first = await complete(key, messages, { reasoning_effort: "none", ...jsonMode });
  const chosen = first.status === 400 ? await complete(key, messages, jsonMode) : first;
  const answer = chosen.text ? readAnswer(chosen.text) : null;
  if (!answer) return Response.json({ error: "The chart could not be read." }, { status: 502 });
  return Response.json(answer);
}

async function complete(
  key: string,
  messages: { role: string; content: string }[],
  extra: Record<string, unknown>,
): Promise<{ status: number; text: string | null }> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4-nano",
        messages,
        max_completion_tokens: 900,
        ...extra,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return { status: response.status, text: null };
    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    return { status: response.status, text: readContent(body.choices?.[0]?.message?.content) };
  } catch {
    return { status: 0, text: null };
  }
}

function readAnswer(raw: string): DemoAnswer | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as { prose?: unknown; models?: unknown; optimizations?: unknown };
  const models = ensureSpread(points(record.models, canonicalModel), 1.8);
  const optimizations = ensureSpread(points(record.optimizations), 2.4);
  if (!models || !optimizations) return null;
  const lean = models.find((point) => point.recommended) ?? models[0];
  const total = formatTokens(lean.input + lean.output);
  let prose = typeof record.prose === "string" ? record.prose.replace(/\s+/g, " ").trim() : "";
  const aligned = prose.includes(lean.name) && /\d/.test(prose) && prose.length >= 24 && !/\$\d|mock|demo|guess/i.test(prose);
  if (!aligned) {
    prose = `${lean.name} is the lean model for this task, around ${total}. A heavier model spends the extra tokens on context you can cut.`;
  }
  return {
    prose,
    card: { title: lean.name, detail: `${formatTokens(lean.input + lean.output)} on the lean model` },
    cases: [],
    models,
    optimizations,
  };
}

function ensureSpread(rows: SolutionPoint[] | null, minRatio: number): SolutionPoint[] | null {
  if (!rows || !tight(rows, minRatio)) return rows;
  const leanIndex = Math.max(0, rows.findIndex((point) => point.recommended));
  const base = Math.max(rows[leanIndex].input + rows[leanIndex].output, 1600);
  const factors = [1.8, 2.6, 3.5];
  let cursor = 0;
  return rows.map((point, index) => {
    const chosen = index === leanIndex;
    const factor = chosen ? 1 : (factors[cursor++] ?? 3.5);
    const whole = Math.max(1200, Math.round((base * factor) / 100) * 100);
    const output = Math.max(200, Math.round((whole * 0.22) / 100) * 100);
    return { ...point, recommended: chosen, input: whole - output, output };
  });
}

function tight(rows: SolutionPoint[], ratio: number) {
  const totals = rows.map((point) => point.input + point.output);
  const low = Math.min(...totals);
  const high = Math.max(...totals);
  return high < low * ratio;
}

function canonicalModel(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes("haiku")) return "Haiku";
  if (lower.includes("sonnet")) return "Sonnet";
  if (lower.includes("opus")) return "Opus";
  if (lower.includes("gpt")) return "GPT-5";
  return null;
}

function points(
  value: unknown,
  rename?: (name: string) => string | null,
): SolutionPoint[] | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const seen = new Set<string>();
  const next: SolutionPoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { name?: unknown; input?: unknown; output?: unknown; recommended?: unknown };
    const raw = String(row.name ?? "").replace(/\s+/g, " ").trim();
    const name = rename ? rename(raw) : raw;
    if (!name || name.length > 42 || seen.has(name.toLowerCase())) continue;
    const input = tokens(row.input);
    const output = tokens(row.output);
    if (input === null || output === null) continue;
    seen.add(name.toLowerCase());
    next.push({
      name,
      input,
      output: Math.min(output, input),
      recommended: row.recommended === true,
    });
    if (next.length === 4) break;
  }
  if (next.length < 4) return null;
  if (next.filter((point) => point.recommended).length !== 1) {
    const lean = next.reduce((best, point) =>
      point.input + point.output < best.input + best.output ? point : best,
    );
    for (const point of next) point.recommended = point === lean;
  }
  return next;
}

function tokens(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const step = number < 20_000 ? 100 : 1000;
  return Math.min(1_500_000, Math.max(step, Math.round(number / step) * step));
}

function readContent(content: unknown): string | null {
  if (typeof content === "string") {
    const text = content.trim();
    return text || null;
  }
  if (!Array.isArray(content)) return null;
  const text = content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        return String((part as { text?: unknown }).text ?? "");
      }
      return "";
    })
    .join("")
    .trim();
  return text || null;
}
