import { GoogleGenAI } from "@google/genai";
import { DEFAULT_LIVE_MODEL, LIVE_API_VERSION, liveConfig } from "@/lib/voice-agent";

// Mints a single-use ephemeral token so the browser can open a Gemini Live
// session without seeing the API key. The token locks the model and config.
export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ available: false });

  const model = process.env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL;
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: LIVE_API_VERSION } });
  const now = Date.now();
  try {
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        liveConnectConstraints: { model, config: liveConfig() },
      },
    });
    if (!token.name) return Response.json({ available: false });
    return Response.json({ available: true, token: token.name, model });
  } catch {
    return Response.json({ available: false });
  }
}
