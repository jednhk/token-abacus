import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { loadFont as loadNewsreader } from "@remotion/google-fonts/Newsreader";
import { Easing, interpolate, spring } from "remotion";

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;
export const DURATION = 600;
export const CX = WIDTH / 2;
export const CY = HEIGHT / 2;

// The site's palette (web/src/app/globals.css + Tailwind neutrals). No accent colour.
export const C = {
  ink: "#111111",
  bead: "#0A0A0A",
  muted: "#737373",
  faint: "#A3A3A3",
  line: "#E5E5E5",
  dot: "#ECECEC",
  paper: "#FFFFFF",
};

export const F = {
  serif: loadNewsreader("normal", { weights: ["500"], subsets: ["latin"] }).fontFamily,
  sans: loadGeist("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily,
  mono: loadGeistMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily,
};

export const E = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  linear: (t: number) => t,
};

const SPRINGS = {
  bead: { damping: 12, stiffness: 180, mass: 1 },
  ui: { damping: 20, stiffness: 200, mass: 1 },
  snap: { damping: 26, stiffness: 300, mass: 1 },
};

/** Spring that starts at `from` (absolute frame); 0 before it. */
export function spr(f: number, from: number, kind: keyof typeof SPRINGS = "ui") {
  if (f < from) return 0;
  return spring({ frame: f - from, fps: FPS, config: SPRINGS[kind] });
}

/** Clamped tween between two absolute frames. */
export function tw(
  f: number,
  a: number,
  b: number,
  from = 0,
  to = 1,
  ease: (t: number) => number = E.inOut,
) {
  return interpolate(f, [a, b], [from, to], {
    easing: ease,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Piecewise keyframes: [[frame, value], ...] with one easing per segment. */
export function kf(f: number, keys: [number, number][], ease = E.inOut) {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [fa, va] = keys[i - 1];
    const [fb, vb] = keys[i];
    if (f <= fb) return tw(f, fa, fb, va, vb, ease);
  }
  return keys[keys.length - 1][1];
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
