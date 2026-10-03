import { loadFont as loadSerif } from "@remotion/google-fonts/Newsreader";
import { loadFont as loadSans } from "@remotion/google-fonts/Geist";
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono";
import { Easing, interpolate, spring } from "remotion";

export const serif = loadSerif("normal", { weights: ["400", "500", "600"] }).fontFamily;
export const sans = loadSans("normal", { weights: ["400", "500", "600"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["400", "500"] }).fontFamily;

export const FPS = 30;

export const c = {
  bg: "#ffffff",
  ink: "#111111",
  muted: "#8a8a8a",
  line: "#ececec",
  card: "#ffffff",
  term: "#0d0d0d",
  // The one accent: only dollar figures use it.
  money: "#00a35c",
};

// Real numbers from the live estimate API and recent_runs (2026-10-03).
export const data = {
  task: "Add a Stripe webhook to my Next.js app",
  model: "claude-opus-4-8",
  modelShort: "Opus 4.8",
  typical: 1.72,
  budget: 2.29,
  budgetTokens: 335_248,
  similar: 14,
  match: 0.933,
  actualUsd: 1.61,
  actualTokens: 216_700,
  minUsd: 0.16,
  maxUsd: 655.09,
  cta: "npx token-abacus init",
};

// The 14 recorded Opus 4.8 runs behind that estimate, plus the two on other models.
export const runs: { model: string; usd: number }[] = [
  ...[1.56, 1.97, 3.39, 1.58, 2.41, 1.61, 1.46, 1.43, 1.72, 1.79, 1.76, 1.72, 1.81, 1.62].map((usd) => ({
    model: "Opus 4.8",
    usd,
  })),
  { model: "Haiku 4.5", usd: 1.86 },
  { model: "Opus 5", usd: 1.64 },
];

// 120 BPM: every cut lands on a beat.
export const BEAT = 15;

export const ease = Easing.bezier(0.16, 1, 0.3, 1);

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// 0 → 1 over [from, from + dur] frames with an expo-out curve.
export function prog(frame: number, from: number, dur: number, easing = ease) {
  return interpolate(frame, [from, from + dur], [0, 1], { ...clamp, easing });
}

export function pop(frame: number, fps: number, delay = 0, damping = 14) {
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.6, stiffness: 160 } });
}

export function typed(text: string, frame: number, start: number, cps = 28) {
  const n = Math.max(0, Math.floor(((frame - start) / FPS) * cps));
  return text.slice(0, n);
}

export function usd(n: number) {
  return `$${n.toFixed(2)}`;
}

export function caret(frame: number) {
  return Math.floor(frame / 15) % 2 === 0 ? 1 : 0;
}
