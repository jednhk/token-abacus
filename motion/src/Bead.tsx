import { C } from "./theme";

// Vector rebuild of web/public/img/mascot.png: a glossy black abacus bead with a face.
// Geometry is in a 500 × 420 box; at scale 1 the body is 450 wide and 360 tall.
export const BEAD_BOX = { w: 500, h: 420 };
export const BODY_CENTER = { x: 250, y: 205 };
/** The hole's centre sits this many units above the body centre (at scale 1). */
export const HOLE_OFFSET_Y = 120;
export const BODY_W = 450;
export const BODY_H = 360;

// Squarish superellipse: the mascot is a rounded, slightly flat-topped donut.
function bodyPath() {
  const rx = BODY_W / 2;
  const ry = BODY_H / 2;
  const n = 2.25;
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = BODY_CENTER.x + rx * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = BODY_CENTER.y + ry * Math.sign(s) * Math.abs(s) ** (2 / n);
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(" ") + "Z";
}
const BODY_D = bodyPath();

export type BeadProps = {
  /** Centre of the body in screen pixels. */
  x: number;
  y: number;
  /** 1 = 360px tall body. */
  scale: number;
  /** Show eyes and smile. Faceless beads are used for the abacus and the bead rain. */
  face?: boolean;
  /** 0 = closed, 1 = open. */
  eyes?: number;
  /** 0–1 draw-on of the smile. */
  smile?: number;
  /** Pupil offset in units (−1…1 per axis). */
  look?: { x: number; y: number };
  /** Squash: >0 flattens (scaleX 1+0.18s, scaleY 1−0.16s), around the bottom centre. */
  squash?: number;
  /** Extra horizontal stretch, used for the circle → bead morph (0.8 = circle). */
  widthFactor?: number;
  opacity?: number;
  shadow?: boolean;
  id?: string;
};

export function Bead({
  x,
  y,
  scale,
  face = true,
  eyes = 1,
  smile = 1,
  look = { x: 0, y: 0 },
  squash = 0,
  widthFactor = 1,
  opacity = 1,
  shadow = true,
  id = "bead",
}: BeadProps) {
  if (scale <= 0 || opacity <= 0) return null;
  const sx = scale * widthFactor * (1 + 0.18 * squash);
  const sy = scale * (1 - 0.16 * squash);
  // Pin the bottom of the body when squashing.
  const bottomFix = (BODY_H / 2) * (scale - sy);
  const w = BEAD_BOX.w;
  const h = BEAD_BOX.h;
  const eyeOpen = Math.max(0.06, eyes);
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        overflow: "visible",
        opacity,
        transformOrigin: `${BODY_CENTER.x}px ${BODY_CENTER.y}px`,
        transform: `translate(${x - BODY_CENTER.x}px, ${y - BODY_CENTER.y + bottomFix}px) scale(${sx}, ${sy})`,
      }}
    >
      <defs>
        <radialGradient id={`${id}-body`} cx="0.36" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#3A3A3A" />
          <stop offset="0.45" stopColor="#1A1A1A" />
          <stop offset="1" stopColor={C.bead} />
        </radialGradient>
        <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-hole`} cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#000000" />
          <stop offset="0.8" stopColor="#060606" />
          <stop offset="1" stopColor="#1C1C1C" />
        </radialGradient>
        <filter id={`${id}-shadow`} x="-50%" y="-200%" width="200%" height="500%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      {shadow ? (
        <ellipse
          cx={BODY_CENTER.x}
          cy={BODY_CENTER.y + BODY_H / 2 + 8}
          rx={190}
          ry={16}
          fill="#000"
          opacity={0.14}
          filter={`url(#${id}-shadow)`}
        />
      ) : null}
      <path d={BODY_D} fill={`url(#${id}-body)`} />
      {/* top rim highlight */}
      <ellipse cx={200} cy={78} rx={120} ry={42} fill={`url(#${id}-gloss)`} transform="rotate(-14 200 78)" />
      {/* hole: lighter rim, dark well */}
      <ellipse cx={BODY_CENTER.x} cy={BODY_CENTER.y - HOLE_OFFSET_Y + 2} rx={100} ry={39} fill="#2A2A2A" />
      <ellipse
        cx={BODY_CENTER.x}
        cy={BODY_CENTER.y - HOLE_OFFSET_Y}
        rx={95}
        ry={35}
        fill={`url(#${id}-hole)`}
      />
      {face ? (
        <g>
          {[150, 350].map((ex, i) => (
            <g key={ex} transform={`translate(${ex} 222) scale(1 ${eyeOpen}) translate(${-ex} -222)`}>
              <circle cx={ex} cy={222} r={54} fill="#FFFFFF" />
              <circle
                cx={ex + (i === 0 ? 4 : -4) + look.x * 14}
                cy={224 + look.y * 12}
                r={36}
                fill="#0B0B0B"
              />
              <circle
                cx={ex + (i === 0 ? 4 : -4) + look.x * 14 + 8}
                cy={224 + look.y * 12 - 13}
                r={11}
                fill="#FFFFFF"
              />
            </g>
          ))}
          {smile > 0 ? (
            <path
              d="M 212 276 Q 250 306 288 276"
              fill="none"
              stroke="#5A5A5A"
              strokeWidth={15}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - smile}
            />
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}

/** Screen position of the hole's centre for a bead at (x, y, scale). */
export function holeAt(x: number, y: number, scale: number) {
  return { x, y: y - HOLE_OFFSET_Y * scale };
}
