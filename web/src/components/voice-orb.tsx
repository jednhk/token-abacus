"use client";

import { useEffect, useRef } from "react";

export type OrbState = "idle" | "connecting" | "live" | "thinking";

type Levels = () => { input: number; output: number };

const silent: Levels = () => ({ input: 0, output: 0 });
const POINTS = 120;
const BLINK_MS = 160;

// The Abacus bead as a living orb: a glossy black sphere whose edge ripples,
// whose inner smoke swirls, and which swells with whoever is speaking.
export function VoiceOrb({
  size,
  state,
  levels = silent,
  className,
}: {
  size: number;
  state: OrbState;
  levels?: Levels;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const levelsRef = useRef(levels);

  useEffect(() => {
    stateRef.current = state;
    levelsRef.current = levels;
  }, [state, levels]);

  useEffect(() => {
    const node = canvas.current;
    const context = node?.getContext("2d");
    if (!node || !context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    node.width = Math.round(size * ratio);
    node.height = Math.round(size * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let energy = 0;
    let voice = 0;
    let spin = 0;
    let clock = 0;
    let last = performance.now();
    const face: Face = { open: 1, gazeX: 0, gazeY: 0, mouth: 0 };
    const pointer = { x: 0, y: 0, at: -Infinity };
    let lastBlink = -Infinity;
    let nextBlink = last + 2500;

    const look = (event: PointerEvent) => {
      const box = node.getBoundingClientRect();
      const reach = Math.max(260, box.width * 1.5);
      pointer.x = clamp((event.clientX - (box.left + box.width / 2)) / reach);
      pointer.y = clamp((event.clientY - (box.top + box.height / 2)) / reach);
      pointer.at = performance.now();
    };
    window.addEventListener("pointermove", look);

    const draw = (now: number) => {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      const mode = stateRef.current;
      const { input, output } = levelsRef.current();
      const target = Math.max(input, output * 1.15);
      energy += (target - energy) * (target > energy ? 0.35 : 0.08);
      voice += ((output > input ? 1 : 0) - voice) * 0.05;
      const pace = mode === "thinking" ? 2.6 : mode === "connecting" ? 1.6 : 1;
      if (!still) {
        clock += delta * pace;
        spin += delta * (0.35 + energy * 1.6) * pace;
      }
      // Eyes follow the cursor; left alone they wander, and they glance up while thinking.
      const idle = now - pointer.at > 3000;
      const aimX = mode === "thinking" ? 0.6 : idle ? Math.sin(clock * 0.45) * 0.5 : pointer.x;
      const aimY = mode === "thinking" ? -0.7 : idle ? Math.sin(clock * 0.3) * 0.25 : pointer.y;
      face.gazeX += (aimX - face.gazeX) * 0.12;
      face.gazeY += (aimY - face.gazeY) * 0.12;
      if (!still && now > nextBlink) {
        lastBlink = now;
        nextBlink = now + 2600 + Math.random() * 3200;
      }
      const sinceBlink = now - lastBlink;
      face.open = sinceBlink < BLINK_MS ? Math.abs(1 - (2 * sinceBlink) / BLINK_MS) : 1;
      face.mouth += (energy * voice - face.mouth) * 0.4;
      paint(context, size, clock, spin, energy, voice, mode, still, face);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", look);
    };
  }, [size]);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

function paint(
  context: CanvasRenderingContext2D,
  size: number,
  time: number,
  spin: number,
  energy: number,
  voice: number,
  mode: OrbState,
  still: boolean,
  face: Face,
) {
  context.clearRect(0, 0, size, size);
  const breathe = still ? 0 : Math.sin(time * 1.25) * 0.025;
  const pulse = mode === "connecting" ? Math.max(0, Math.sin(time * 4)) * 0.04 : 0;
  const radius = size * 0.34 * (1 + breathe + pulse + energy * 0.14);
  const cx = size / 2 + (still ? 0 : Math.sin(time * 0.55) * size * 0.018);
  const cy = size * 0.47 + (still ? 0 : Math.cos(time * 0.75) * size * 0.022);

  // Ground shadow: tighter and darker when the orb sinks toward it.
  const lift = (cy - size * 0.47) / (size * 0.022);
  context.save();
  context.filter = `blur(${size * 0.03}px)`;
  context.fillStyle = `rgba(0,0,0,${0.13 + lift * 0.03})`;
  context.beginPath();
  context.ellipse(size / 2, size * 0.9, radius * (0.78 + lift * 0.05), radius * 0.1, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  // Halo that blooms while Abacus is talking.
  if (energy > 0.02) {
    const halo = context.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.25);
    halo.addColorStop(0, `rgba(20,20,20,${0.16 * energy * (0.4 + voice)})`);
    halo.addColorStop(1, "rgba(20,20,20,0)");
    context.fillStyle = halo;
    context.fillRect(0, 0, size, size);
  }

  // Wobbling outline: a few slow sine waves around the rim, louder voice, bigger waves.
  const wobble = 0.012 + energy * 0.06;
  const outline = new Path2D();
  for (let index = 0; index <= POINTS; index += 1) {
    const angle = (index / POINTS) * Math.PI * 2;
    const ripple =
      Math.sin(angle * 3 + time * 1.7) * 0.5 +
      Math.sin(angle * 5 - time * 2.3) * 0.3 +
      Math.sin(angle * 2 + time * 0.9) * 0.6;
    const r = radius * (1 + ripple * wobble);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r * 0.96;
    if (index === 0) outline.moveTo(x, y);
    else outline.lineTo(x, y);
  }
  outline.closePath();

  context.save();
  context.clip(outline);

  const body = context.createRadialGradient(
    cx - radius * 0.35,
    cy - radius * 0.4,
    radius * 0.1,
    cx,
    cy,
    radius * 1.1,
  );
  body.addColorStop(0, "#3a3a3a");
  body.addColorStop(0.45, "#141414");
  body.addColorStop(1, "#000000");
  context.fillStyle = body;
  context.fill(outline);

  // Inner smoke: a turning conic sweep of greys, blurred into soft ribbons.
  context.filter = `blur(${radius * 0.14}px)`;
  context.globalCompositeOperation = "screen";
  const swirl = context.createConicGradient(spin, cx, cy);
  const glow = 0.55 + energy * 0.35;
  swirl.addColorStop(0, `rgba(200,200,200,${glow})`);
  swirl.addColorStop(0.22, "rgba(0,0,0,0)");
  swirl.addColorStop(0.5, `rgba(150,150,150,${glow * 0.75})`);
  swirl.addColorStop(0.72, "rgba(0,0,0,0)");
  swirl.addColorStop(1, `rgba(200,200,200,${glow})`);
  context.fillStyle = swirl;
  context.beginPath();
  context.ellipse(cx, cy + radius * 0.1, radius * 0.8, radius * 0.62, spin * 0.3, 0, Math.PI * 2);
  context.fill();

  // Two drifting light pools give the depth of the ElevenLabs-style orb.
  for (let index = 0; index < 2; index += 1) {
    const angle = spin * (index ? -0.7 : 1.1) + index * Math.PI;
    const px = cx + Math.cos(angle) * radius * 0.42;
    const py = cy + Math.sin(angle) * radius * 0.36;
    const pool = context.createRadialGradient(px, py, 0, px, py, radius * 0.55);
    pool.addColorStop(0, `rgba(255,255,255,${0.16 + energy * 0.25})`);
    pool.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = pool;
    context.fillRect(cx - radius * 1.2, cy - radius * 1.2, radius * 2.4, radius * 2.4);
  }
  context.filter = "none";
  context.globalCompositeOperation = "source-over";

  // Rim shading keeps the edge inky so the sphere reads as solid.
  const rim = context.createRadialGradient(cx, cy, radius * 0.72, cx, cy, radius * 1.04);
  rim.addColorStop(0, "rgba(0,0,0,0)");
  rim.addColorStop(1, "rgba(0,0,0,0.7)");
  context.fillStyle = rim;
  context.fill(outline);

  // Gloss on the upper left, like the bead in the mascot.
  context.filter = `blur(${radius * 0.06}px)`;
  context.fillStyle = "rgba(255,255,255,0.22)";
  context.beginPath();
  context.ellipse(cx - radius * 0.42, cy - radius * 0.52, radius * 0.24, radius * 0.12, -0.6, 0, Math.PI * 2);
  context.fill();
  context.filter = "none";

  drawFace(context, cx, cy, radius, face);
  context.restore();
}

type Face = { open: number; gazeX: number; gazeY: number; mouth: number };

// The mascot's face: big glossy eyes and a small grey smile that opens as Abacus talks.
function drawFace(context: CanvasRenderingContext2D, cx: number, cy: number, radius: number, face: Face) {
  const turnX = face.gazeX * radius * 0.07;
  const turnY = face.gazeY * radius * 0.05;
  const eye = radius * 0.25;
  for (const side of [-1, 1]) {
    const ex = cx + side * radius * 0.44 + turnX;
    const ey = cy + radius * 0.02 + turnY;
    context.save();
    context.translate(ex, ey);
    if (face.open < 0.15) {
      context.strokeStyle = "#f4f4f4";
      context.lineWidth = eye * 0.22;
      context.lineCap = "round";
      context.beginPath();
      context.arc(0, -eye * 0.5, eye * 0.9, Math.PI * 0.2, Math.PI * 0.8);
      context.stroke();
      context.restore();
      continue;
    }
    context.scale(1, face.open);
    context.fillStyle = "#f7f7f7";
    context.beginPath();
    context.arc(0, 0, eye, 0, Math.PI * 2);
    context.fill();
    context.clip();
    const px = face.gazeX * eye * 0.28 - side * eye * 0.08;
    const py = face.gazeY * eye * 0.24 + eye * 0.06;
    context.fillStyle = "#0b0b0b";
    context.beginPath();
    context.arc(px, py, eye * 0.72, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(px + eye * 0.24, py - eye * 0.26, eye * 0.2, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 0.6;
    context.beginPath();
    context.arc(px - eye * 0.22, py + eye * 0.26, eye * 0.08, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  const mx = cx + turnX;
  const my = cy + radius * 0.3 + turnY;
  const width = radius * 0.15;
  context.fillStyle = "#6a6a6a";
  context.strokeStyle = "#6a6a6a";
  context.lineCap = "round";
  if (face.mouth < 0.04) {
    context.lineWidth = radius * 0.055;
    context.beginPath();
    context.arc(mx, my - width * 0.9, width * 1.2, Math.PI * 0.22, Math.PI * 0.78);
    context.stroke();
    return;
  }
  const depth = radius * (0.03 + Math.min(1, face.mouth) * 0.16);
  context.beginPath();
  context.moveTo(mx - width, my);
  context.quadraticCurveTo(mx, my + depth * 2, mx + width, my);
  context.quadraticCurveTo(mx, my + depth * 0.2, mx - width, my);
  context.fill();
}

function clamp(value: number) {
  return Math.max(-1, Math.min(1, value));
}
