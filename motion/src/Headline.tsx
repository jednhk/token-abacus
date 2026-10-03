import { C, E, F, tw } from "./theme";

type HeadlineProps = {
  f: number;
  text: string;
  /** Frame the first word starts rising. */
  inAt: number;
  /** Frame the 8-frame exit starts. Omit to stay; `cutAt` removes it with no exit. */
  outAt?: number;
  cutAt?: number;
  /** Words (by index) that appear instantly at inAt, no ease (the "WTF" hard cut). */
  hardCut?: number[];
  color?: string;
  /** Soft white glow so the line reads over Act 1 chaos. */
  glow?: boolean;
  /** Baseline y; defaults to the spec's headline slot. */
  y?: number;
  size?: number;
};

/** The single headline slot: word-by-word reveal, blur-and-fade exit. */
export function Headline({
  f,
  text,
  inAt,
  outAt,
  cutAt,
  hardCut = [],
  color = C.ink,
  glow = false,
  y = 930,
  size = 104,
}: HeadlineProps) {
  if (f < inAt) return null;
  if (cutAt !== undefined && f >= cutAt) return null;
  if (outAt !== undefined && f >= outAt + 8) return null;
  const words = text.split(" ");
  const out = outAt === undefined ? 0 : tw(f, outAt, outAt + 8, 0, 1, E.in);
  // Words after a hard-cut word start right away, then stagger 3 frames each.
  let k = 0;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: y - size * 0.86,
        display: "flex",
        justifyContent: "center",
        opacity: 1 - out,
        filter: out > 0 ? `blur(${out * 10}px)` : undefined,
      }}
    >
      <div
        style={{
          maxWidth: 1680,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: size * 0.24,
          fontFamily: F.serif,
          fontWeight: 500,
          fontSize: size,
          letterSpacing: "-0.03em",
          lineHeight: 0.98,
          color,
          textShadow: glow
            ? "0 0 24px #fff, 0 0 24px #fff, 0 0 48px #fff, 0 0 8px #fff"
            : undefined,
        }}
      >
        {words.map((w, i) => {
          const hard = hardCut.includes(i);
          const start = hard ? inAt : inAt + (hardCut.length ? 2 : 0) + 3 * k++;
          const p = hard ? (f >= inAt ? 1 : 0) : tw(f, start, start + 16, 0, 1, E.out);
          return (
            <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: size * 0.12 }}>
              <span
                style={{
                  display: "inline-block",
                  transform: `translateY(${(1 - p) * 28}px)`,
                  opacity: p,
                }}
              >
                {w}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
