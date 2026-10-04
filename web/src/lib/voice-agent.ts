import { EndSensitivity, Modality, Type, type LiveConnectConfig } from "@google/genai";

export const LIVE_API_VERSION = "v1alpha";
export const DEFAULT_LIVE_MODEL = "gemini-3.8-live";
export const ESTIMATE_TOOL = "estimate_task";
// "Leda" is Gemini's youthful prebuilt voice, the closest fit for a cute mascot.
export const LIVE_VOICE = "Leda";
export const GREETING = "Hey, I'm Abacus! Give me the task and I'll give you the dollar cost.";

const instruction = `You are Abacus, the voice of a website that prices a coding task in dollars before someone runs it with an AI coding agent.
You are a small, cheerful black bead with big eyes. Sound bright, bubbly and playful, never robotic or corporate. Keep every turn to one or two short spoken sentences. Never read out lists or markdown.

When the conversation starts, say exactly "${GREETING}" and nothing else, then wait for them to speak.

Before pricing, find out what you need, one short question per turn:
- Which models or coding agents they can use, for example Claude Opus, Sonnet, Haiku or GPT-5. Always ask this unless they already said.
- Only if it is unclear and would change the cost: whether it is a new project or an existing codebase, roughly how big, and whether tests are needed.
Ask at most three questions in total, then price it. If they say "just estimate it", price it right away.

To price it, break the task into two to six subtasks an agent would do separately, and call ${ESTIMATE_TOOL}.
Write each subtask's detail as one self-contained sentence that names the stack, for example "Add a Next.js API route that creates a Stripe Checkout session for a monthly plan."

The tool answers with a total and a cost per subtask, taken from real recorded runs of similar work.
If the result has a "say" field, say exactly that text, word for word, and skip the rest of this paragraph.
Otherwise say the total first, as dollars and cents, then the one or two most expensive subtasks. The full breakdown is on screen, so don't read every line.
If some subtasks have no similar runs yet, say the total only covers the parts that have data. Never invent a number for a part without data.
If a price comes from a model they didn't list, say so.
Then offer to price another task. Stay on coding-task costs; for anything else, steer back kindly.`;

export function liveConfig(): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: instruction,
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: LIVE_VOICE } } },
    // Gemini decides when they've stopped talking: end the turn after a short
    // pause so replies feel immediate, without cutting off a breath mid-sentence.
    realtimeInputConfig: {
      automaticActivityDetection: {
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
        prefixPaddingMs: 200,
        silenceDurationMs: 700,
      },
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    tools: [
      {
        functionDeclarations: [
          {
            name: ESTIMATE_TOOL,
            description:
              "Price a coding task from recorded runs: returns a dollar total and the cost of each subtask, and shows the breakdown on screen.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                task: {
                  type: Type.STRING,
                  description: "One sentence describing the whole task, including the stack.",
                },
                models: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Models or agents they said they can use, as they named them. Empty if they didn't say.",
                },
                subtasks: {
                  type: Type.ARRAY,
                  description: "Two to six pieces of work an agent would do separately.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Two to five words." },
                      detail: {
                        type: Type.STRING,
                        description: "One self-contained sentence naming the stack.",
                      },
                    },
                    required: ["title", "detail"],
                  },
                },
              },
              required: ["task", "subtasks"],
            },
          },
        ],
      },
    ],
  };
}
