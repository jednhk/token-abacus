import { demoAnswer, keepsFigures } from "@/lib/demo-answer";

export async function POST(request: Request) {
  let prompt = "";
  try {
    const body = (await request.json()) as { prompt?: unknown };
    prompt = String(body.prompt ?? "").trim().slice(0, 2000);
  } catch {
    prompt = "";
  }

  const demo = demoAnswer(prompt || "this task");
  const prose = prompt ? await phrase(prompt, demo.prose) : demo.prose;

  return Response.json({
    prose,
    card: demo.card,
    cases: demo.cases,
  });
}

async function phrase(prompt: string, draft: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return draft;

  const messages = [
    {
      role: "developer",
      content:
        "You write a two-sentence token-cost estimate for Abacus. Use only the dollar amounts in the draft. Do not add prices, models, or tasks. Return the two sentences and nothing else.",
    },
    {
      role: "user",
      content: `Task: ${prompt}\n\nDraft:\n${draft}`,
    },
  ];

  const first = await complete(key, messages, { reasoning_effort: "none" });
  const chosen = first.status === 400 ? await complete(key, messages, {}) : first;
  if (chosen.text && keepsFigures(draft, chosen.text)) return chosen.text;
  return draft;
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
        max_completion_tokens: 300,
        ...extra,
      }),
      signal: AbortSignal.timeout(15000),
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
