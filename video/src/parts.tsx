import type { CSSProperties, ReactNode } from "react";
import { Img, staticFile } from "remotion";
import { c, mono, sans, serif } from "./lib";

// Odometer: every digit is a rolling column, so a changing value spins like a meter.
export function Rolling({
  value,
  size,
  color = c.ink,
  font = sans,
  weight = 600,
  prefix = "$",
  decimals = 2,
  minInt = 1,
}: {
  value: number;
  size: number;
  color?: string;
  font?: string;
  weight?: number;
  prefix?: string;
  decimals?: number;
  minInt?: number;
}) {
  const scaled = value * 10 ** decimals;
  const intPlaces = Math.max(minInt, Math.floor(Math.log10(Math.max(1, value))) + 1);
  const places: number[] = [];
  for (let p = intPlaces + decimals - 1; p >= 0; p--) places.push(p);
  const h = size * 1.05;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        fontFamily: font,
        fontWeight: weight,
        fontSize: size,
        color,
        letterSpacing: "-0.04em",
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
      }}
    >
      {prefix ? <span>{prefix}</span> : null}
      {places.map((p) => {
        const d = (scaled / 10 ** p) % 10;
        // Snap to whole digits except while the digit below is rolling over.
        const below = p === 0 ? 0 : (scaled / 10 ** (p - 1)) % 10;
        const pos = p === 0 ? d : Math.floor(d) + Math.max(0, below - 9);
        return (
          <span key={p} style={{ display: "flex" }}>
            {p === decimals - 1 && decimals > 0 ? <span>.</span> : null}
            <span style={{ height: h, overflow: "hidden", display: "inline-block" }}>
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  transform: `translateY(${-pos * h}px)`,
                }}
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n, i) => (
                  <span key={i} style={{ height: h, display: "flex", alignItems: "center" }}>
                    {n}
                  </span>
                ))}
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

// Eye centres in mascot.png (788×628), as fractions of the image.
const EYES = [
  { x: 0.273, y: 0.506 },
  { x: 0.721, y: 0.506 },
];

// lids: 0 = open, 1 = shut, per eye [left, right].
export function Mascot({
  height,
  lids = [0, 0],
  dark,
  style,
}: {
  height: number;
  lids?: [number, number];
  // On a dark background, mask off the baked-in floor shadow.
  dark?: boolean;
  style?: CSSProperties;
}) {
  const width = (height * 788) / 628;
  return (
    <div style={{ position: "relative", width, height, ...style }}>
      <Img
        src={staticFile("mascot.png")}
        style={{
          width,
          height,
          display: "block",
          maskImage: dark ? "radial-gradient(ellipse 49% 46% at 50% 47%, #000 98%, transparent 100%)" : undefined,
        }}
      />
      {EYES.map((e, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: (e.x - 0.105) * width,
            top: (e.y - 0.135) * height,
            width: 0.21 * width,
            height: 0.27 * height,
            borderRadius: "50%",
            background: "linear-gradient(#1c1c1c, #141414)",
            transform: `scaleY(${lids[i]})`,
            transformOrigin: "50% 0%",
          }}
        />
      ))}
    </div>
  );
}

// A 6-frame blink starting at `at`.
export function blink(frame: number, at: number) {
  const t = frame - at;
  if (t < 0 || t > 6) return 0;
  return t <= 3 ? t / 3 : (6 - t) / 3;
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: c.card,
        border: `1.5px solid ${c.line}`,
        borderRadius: 22,
        boxShadow: "0 18px 60px rgba(0,0,0,0.07)",
        fontFamily: sans,
        color: c.ink,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Pill({ children, dark, style }: { children: ReactNode; dark?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 26px",
        borderRadius: 999,
        background: dark ? c.ink : c.card,
        color: dark ? "#fff" : c.ink,
        border: dark ? "none" : `1.5px solid ${c.line}`,
        boxShadow: "0 12px 40px rgba(0,0,0,0.10)",
        fontFamily: sans,
        fontWeight: 500,
        fontSize: 30,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Headline({ children, size = 120, color = c.ink, style }: { children: ReactNode; size?: number; color?: string; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: serif,
        fontWeight: 500,
        fontSize: size,
        letterSpacing: "-0.035em",
        lineHeight: 0.98,
        color,
        textAlign: "center",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Mono({ children, size = 34, color = c.ink, style }: { children: ReactNode; size?: number; color?: string; style?: CSSProperties }) {
  return <span style={{ fontFamily: mono, fontSize: size, color, ...style }}>{children}</span>;
}
