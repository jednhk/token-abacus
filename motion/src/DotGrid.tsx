import { interpolateColors } from "remotion";
import { C, CX, CY, HEIGHT, WIDTH, kf } from "./theme";

const PITCH = 33;
const R = 0.8;

// Dots on the site's grid (22px at 1x, scaled 1.5x), one sitting exactly on the centre.
const DOTS: { x: number; y: number; centre: boolean }[] = [];
for (let y = CY - Math.ceil(CY / PITCH) * PITCH; y <= HEIGHT + PITCH; y += PITCH) {
  for (let x = CX - Math.ceil(CX / PITCH) * PITCH; x <= WIDTH + PITCH; x += PITCH) {
    DOTS.push({ x, y, centre: x === CX && y === CY });
  }
}

/** The dot grid: warps in Act 1, fades back at the freeze, and gives birth to the bead. */
export function DotGrid({ f }: { f: number }) {
  if (f >= 486 && f < 540) return null; // inside the database: black
  // Warp builds through Scene 2, holds during the freeze, and the halo flattens it.
  const amp = f < 150 ? kf(f, [[90, 0], [134, 14]]) : kf(f, [[150, 14], [175, 0]]);
  const t = Math.min(f, 134);
  const fade = f < 150 ? kf(f, [[135, 1], [141, 0.35]]) : kf(f, [[150, 0.35], [175, 1]]);
  const centreColor = interpolateColors(f, [141, 150], [C.dot, C.bead]);
  const centreR = kf(f, [[141, R], [150, 3]]);
  return (
    <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", inset: 0 }}>
      <g opacity={fade}>
        {DOTS.map((d, i) => {
          if (d.centre && f >= 141) return null;
          let x = d.x;
          let y = d.y;
          if (amp > 0) {
            const dx = d.x - CX;
            const dy = d.y - CY;
            const dist = Math.hypot(dx, dy) || 1;
            const n = Math.sin(dist * 0.021 - t * 0.35) + 0.6 * Math.sin(Math.atan2(dy, dx) * 3 + t * 0.22);
            x += (dx / dist) * n * amp;
            y += (dy / dist) * n * amp;
          }
          return <circle key={i} cx={x} cy={y} r={R} fill={C.dot} />;
        })}
      </g>
      {f >= 141 && f < 151 ? <circle cx={CX} cy={CY} r={centreR} fill={centreColor} /> : null}
    </svg>
  );
}
