import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { c, caret, clamp, data, ease, mono, pop, prog, runs, sans, serif, typed, usd } from "./lib";
import { blink, Card, Headline, Mascot, Pill, Rolling } from "./parts";

const W = 1920;
const H = 1080;

function Fill({ bg, children, style }: { bg: string; children: ReactNode; style?: CSSProperties }) {
  return <AbsoluteFill style={{ background: bg, overflow: "hidden", ...style }}>{children}</AbsoluteFill>;
}

// Slow push-in on the whole frame.
function Push({ from = 1, to = 1.06, dur, children }: { from?: number; to?: number; dur: number; children: ReactNode }) {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, dur], [from, to], { ...clamp, easing: Easing.inOut(Easing.quad) });
  return <AbsoluteFill style={{ transform: `scale(${s})` }}>{children}</AbsoluteFill>;
}

// Word-by-word rise: each word slides up and fades in, `gap` frames apart.
function Rise({
  words,
  at,
  gap = 4,
  size,
  color = c.ink,
  font = serif,
  style,
}: {
  words: ReactNode[];
  at: number;
  gap?: number;
  size: number;
  color?: string;
  font?: string;
  style?: CSSProperties;
}) {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: size * 0.24,
        fontFamily: font,
        fontWeight: 500,
        fontSize: size,
        letterSpacing: "-0.035em",
        lineHeight: 1,
        color,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const p = prog(f, at + i * gap, 14);
        return (
          <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * size * 0.5}px)` }}>
            {w}
          </span>
        );
      })}
    </div>
  );
}

function Caret({ on, h, color }: { on: number; h: number; color: string }) {
  return <span style={{ display: "inline-block", width: h * 0.5, height: h, background: color, opacity: on, marginLeft: 6 }} />;
}

// ─── 1. Cold open: a prompt goes in, nobody can say what it costs ────────────────────────────

export function Terminal() {
  const f = useCurrentFrame();
  const text = typed(data.task, f, 6, 30);
  const enter = 52;
  const entered = f >= enter;
  const scramble = usd(random(`s${Math.floor(f / 2)}`) * 999);

  return (
    <Fill bg={c.term}>
      <Push dur={90} to={1.08}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{ width: 1480, transform: `translateY(${entered ? -prog(f, enter, 10) * 40 : 0}px)` }}>
            <div style={{ fontFamily: mono, fontSize: 58, color: "#fff", display: "flex", alignItems: "center" }}>
              <span style={{ color: "#555", marginRight: 30 }}>›</span>
              {text}
              <Caret on={entered ? 0 : caret(f)} h={62} color="#fff" />
            </div>
            <div
              style={{
                fontFamily: mono,
                fontSize: 44,
                color: "#666",
                marginTop: 44,
                marginLeft: 66,
                opacity: entered ? prog(f, enter + 4, 8) : 0,
              }}
            >
              cost: <span style={{ color: c.money }}>{scramble}</span>
              <span style={{ color: "#444" }}>?</span>
            </div>
          </div>
        </AbsoluteFill>
      </Push>
    </Fill>
  );
}

// ─── 2. The meter spins out of control ───────────────────────────────────────────────────────

export function Meter() {
  const f = useCurrentFrame();
  const land = 92;
  const value = interpolate(f, [0, 18, 34, 52, 70, land], [0.16, 14.8, 3.42, 96.5, 38.1, data.maxUsd], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const speed = Math.abs(value - interpolate(f - 1, [0, 18, 34, 52, 70, land], [0.16, 14.8, 3.42, 96.5, 38.1, data.maxUsd], clamp));
  const amp = f < land ? Math.min(16, 3 + speed * 0.4) : 18 * (1 - prog(f, land, 14));
  const dx = (random(`x${f}`) - 0.5) * amp;
  const dy = (random(`y${f}`) - 0.5) * amp;
  const jolt = f >= land ? 1 + 0.08 * (1 - prog(f, land, 12)) : 1;

  return (
    <Fill bg={c.bg}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Rise words={["What", "will", "this", "cost?"]} at={0} gap={3} size={92} style={{ position: "absolute", top: 170 }} />
        <div style={{ transform: `translate(${dx}px, ${dy}px) scale(${jolt})` }}>
          <Rolling value={value} size={300} color={c.money} />
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 170,
            fontFamily: sans,
            fontSize: 38,
            color: c.muted,
            opacity: prog(f, land + 2, 12),
            transform: `translateY(${(1 - prog(f, land + 2, 12)) * 20}px)`,
          }}
        >
          Real agent tasks have cost anywhere from <span style={{ color: c.money }}>{usd(data.minUsd)}</span> to{" "}
          <span style={{ color: c.money }}>{usd(data.maxUsd)}</span>.
        </div>
      </AbsoluteFill>
    </Fill>
  );
}

// ─── 3. Nobody knows ─────────────────────────────────────────────────────────────────────────

function Slam({ children, at, size, color }: { children: ReactNode; at: number; size: number; color: string }) {
  const f = useCurrentFrame();
  const p = prog(f, at, 8, Easing.out(Easing.cubic));
  return (
    <span style={{ display: "inline-block", opacity: f >= at ? 1 : 0, transform: `scale(${1.5 - 0.5 * p})`, color }}>
      {children}
    </span>
  );
}

export function NobodyKnows() {
  return (
    <Fill bg={c.term}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 40 }}>
        <Headline size={190} color="#fff" style={{ display: "flex", gap: 44 }}>
          <Slam at={0} size={190} color="#fff">Nobody</Slam>
          <Slam at={7} size={190} color="#fff">knows.</Slam>
        </Headline>
        <Rise words={["Not", "even", "your", "agent."]} at={26} gap={3} size={104} color="#6f6f6f" />
      </AbsoluteFill>
    </Fill>
  );
}

// ─── 4. Meet Abacus ──────────────────────────────────────────────────────────────────────────

export function Meet() {
  const f = useCurrentFrame();
  const fall = interpolate(f, [0, 12], [-900, 0], { ...clamp, easing: Easing.in(Easing.quad) });
  const sy = interpolate(f, [12, 15, 19, 24], [1, 0.8, 1.05, 1], clamp);
  const sx = interpolate(f, [12, 15, 19, 24], [1, 1.16, 0.97, 1], clamp);
  const shadow = interpolate(f, [0, 12], [0.3, 1], clamp);
  const b = blink(f, 58);
  const h = 400;

  return (
    <Fill bg={c.bg}>
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div
          style={{
            position: "absolute",
            top: 640,
            width: 420 * shadow,
            height: 46 * shadow,
            borderRadius: "50%",
            background: "radial-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0) 70%)",
          }}
        />
        <div style={{ position: "absolute", top: 260, transform: `translateY(${fall}px) scale(${sx}, ${sy})`, transformOrigin: "50% 100%" }}>
          <Mascot height={h} lids={[b, b]} />
        </div>
        <Rise words={["Meet", "Abacus."]} at={24} gap={6} size={170} style={{ position: "absolute", top: 760 }} />
      </AbsoluteFill>
    </Fill>
  );
}

// ─── 5. It has seen this task before ─────────────────────────────────────────────────────────

const COLS = 4;
const CW = 400;
const CH = 150;
const GAP = 24;
const PICK = 5; // the $1.61 run

function RunCard({ model, cost, dim, style }: { model: string; cost: number; dim?: number; style?: CSSProperties }) {
  return (
    <Card style={{ width: CW, height: CH, padding: "22px 28px", display: "flex", flexDirection: "column", justifyContent: "space-between", ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: c.muted }}>
        <span style={{ color: c.ink, fontWeight: 500 }}>Stripe webhook</span>
        <span>{model}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontSize: 58, fontWeight: 600, letterSpacing: "-0.04em", color: c.money }}>{usd(cost)}</span>
        <span style={{ fontFamily: mono, fontSize: 20, color: c.muted }}>claude-code</span>
      </div>
      {dim ? <div style={{ position: "absolute", inset: 0, borderRadius: 22, background: `rgba(255,255,255,${dim})` }} /> : null}
    </Card>
  );
}

function Brackets({ w, h, p }: { w: number; h: number; p: number }) {
  const s = 1.25 - 0.25 * p;
  const arm = 36;
  const t = 5;
  const corner = (style: CSSProperties) => <div style={{ position: "absolute", width: arm, height: arm, borderColor: c.ink, borderStyle: "solid", ...style }} />;
  return (
    <div style={{ position: "absolute", inset: -18, opacity: p, transform: `scale(${s})` }}>
      {corner({ left: 0, top: 0, borderWidth: `${t}px 0 0 ${t}px`, borderTopLeftRadius: 10 })}
      {corner({ right: 0, top: 0, borderWidth: `${t}px ${t}px 0 0`, borderTopRightRadius: 10 })}
      {corner({ left: 0, bottom: 0, borderWidth: `0 0 ${t}px ${t}px`, borderBottomLeftRadius: 10 })}
      {corner({ right: 0, bottom: 0, borderWidth: `0 ${t}px ${t}px 0`, borderBottomRightRadius: 10 })}
      <div style={{ width: w, height: h }} />
    </div>
  );
}

export function Precedent() {
  const f = useCurrentFrame();
  const gridW = COLS * CW + (COLS - 1) * GAP;
  const rows = Math.ceil(runs.length / COLS);
  const gridH = rows * CH + (rows - 1) * GAP;
  const gx = (W - gridW) / 2;
  const gy = 250;

  const select = 112;
  const sel = prog(f, select, 14);
  const pickX = gx + (PICK % COLS) * (CW + GAP) + CW / 2;
  const pickY = gy + Math.floor(PICK / COLS) * (CH + GAP) + CH / 2;

  // Drift in, then push hard onto the picked card.
  const zoomIn = prog(f, select + 8, 34, Easing.inOut(Easing.cubic));
  const base = interpolate(f, [0, select], [0.94, 1], clamp);
  const scale = base + zoomIn * 0.75;
  const tx = (W / 2 - pickX) * zoomIn;
  const ty = (H / 2 - 40 - pickY) * zoomIn;

  const caption2 = f >= select + 16;

  return (
    <Fill bg={c.bg}>
      <AbsoluteFill style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: `${pickX}px ${pickY}px` }}>
        {/* The prompt, as typed into the site */}
        <div
          style={{
            position: "absolute",
            left: (W - 1120) / 2,
            top: 90,
            width: 1120,
            height: 100,
            borderRadius: 999,
            border: `1.5px solid ${c.line}`,
            boxShadow: "0 12px 40px rgba(0,0,0,0.07)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px 0 40px",
            fontFamily: sans,
            fontSize: 36,
            color: c.ink,
            opacity: prog(f, 0, 10),
            transform: `translateY(${(1 - prog(f, 0, 14)) * -30}px)`,
            background: "#fff",
          }}
        >
          {data.task}
          <div style={{ width: 68, height: 68, borderRadius: 999, background: c.ink, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>
            ↑
          </div>
        </div>

        {runs.map((r, i) => {
          const at = 10 + i * 3;
          const p = prog(f, at, 18);
          const x = gx + (i % COLS) * (CW + GAP);
          const y = gy + Math.floor(i / COLS) * (CH + GAP);
          const isPick = i === PICK;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                top: y,
                opacity: p,
                transform: `translateY(${(1 - p) * 160}px) rotate(${(1 - p) * (i % 2 ? 4 : -4)}deg)`,
              }}
            >
              <RunCard model={r.model} cost={r.usd} dim={isPick ? 0 : sel * 0.7} />
              {isPick ? <Brackets w={CW} h={CH} p={sel} /> : null}
              {isPick ? (
                <Pill dark style={{ position: "absolute", top: -78, left: CW / 2, transform: `translateX(-50%) scale(${0.6 + 0.4 * sel})`, opacity: sel, fontSize: 26, padding: "10px 20px" }}>
                  {Math.round(data.match * 100)}% match
                </Pill>
              ) : null}
            </div>
          );
        })}
      </AbsoluteFill>

      {/* Caption stays still while the camera moves */}
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 80 }}>
        <div style={{ position: "absolute", inset: "auto 0 0 0", height: 300, background: "linear-gradient(rgba(255,255,255,0), #fff 55%)" }} />
        {caption2 ? (
          <Rise key="b" words={["14", "real", "runs", "of", "a", "task", "just", "like", "it."]} at={select + 16} gap={2} size={76} />
        ) : (
          <Rise key="a" words={["Abacus", "has", "seen", "this", "before."]} at={30} gap={3} size={76} />
        )}
      </AbsoluteFill>
    </Fill>
  );
}

// ─── 6. The meter rolls back down to the real number ─────────────────────────────────────────

export function RollDown() {
  const f = useCurrentFrame();
  const value = interpolate(f, [8, 62], [data.maxUsd, data.typical], { ...clamp, easing: Easing.bezier(0.05, 0.9, 0.1, 1) });
  const chips = [
    <>Budget <span style={{ color: c.money }}>{usd(data.budget)}</span></>,
    <>{data.modelShort}</>,
    <>{data.similar} similar runs</>,
  ];
  return (
    <Fill bg={c.bg}>
      <Push dur={150} to={1.05}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <Rise words={["Know", "the", "cost", <i key="b">before</i>, "you", "send", "it."]} at={0} gap={2} size={96} style={{ position: "absolute", top: 150 }} />
          <div style={{ fontFamily: sans, fontSize: 36, color: c.muted, marginBottom: 6, opacity: prog(f, 6, 10) }}>Typical cost</div>
          <Rolling value={value} size={320} color={c.money} />
          <div style={{ position: "absolute", bottom: 170, display: "flex", gap: 24 }}>
            {chips.map((chip, i) => {
              const p = pop(f, 30, 66 + i * 5);
              return (
                <Pill key={i} style={{ transform: `scale(${p})`, opacity: Math.min(1, p * 2), fontSize: 36, padding: "18px 34px" }}>
                  {chip}
                </Pill>
              );
            })}
          </div>
        </AbsoluteFill>
      </Push>
    </Fill>
  );
}

// ─── 7. The agent works, then the real cost is recorded ──────────────────────────────────────

const LOG: { t: string; color?: string }[] = [
  { t: `› ${data.task}`, color: "#fff" },
  { t: `  estimate ${usd(data.typical)} · budget ${usd(data.budget)}`, color: c.money },
  { t: "● Read app/api/stripe/route.ts" },
  { t: "● Write lib/stripe/verify-signature.ts" },
  { t: "● Edit app/api/stripe/webhook/route.ts" },
  { t: "● Run npm test" },
  { t: "✓ tests passed", color: "#fff" },
  { t: "● submit_run → recorded", color: "#fff" },
];

export function Actual() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stamp = 84;
  const s = pop(f, fps, stamp, 10);
  const stampScale = f < stamp ? 0 : 1.9 - 0.9 * s;

  return (
    <Fill bg={c.bg}>
      <Rise words={["Then", "it", "records", "what", "it", "really", "cost."]} at={0} gap={2} size={80} style={{ position: "absolute", top: 110, width: "100%" }} />

      {/* Agent session */}
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 290,
          width: 900,
          height: 560,
          borderRadius: 24,
          background: c.term,
          padding: "44px 48px",
          boxShadow: "0 30px 80px rgba(0,0,0,0.25)",
          fontFamily: mono,
          fontSize: 27,
          lineHeight: 1.9,
          color: "#7a7a7a",
          whiteSpace: "pre",
          opacity: prog(f, 0, 8),
          transform: `translateY(${(1 - prog(f, 0, 16)) * 40}px)`,
        }}
      >
        {LOG.map((l, i) => {
          const at = 6 + i * 9;
          return (
            <div key={i} style={{ color: l.color, opacity: f >= at ? 1 : 0 }}>
              {l.t}
            </div>
          );
        })}
      </div>

      {/* Estimate vs actual */}
      <div style={{ position: "absolute", left: 1150, top: 330, display: "flex", flexDirection: "column", gap: 56, fontFamily: sans }}>
        <div style={{ opacity: prog(f, 18, 12) }}>
          <div style={{ fontSize: 34, color: c.muted }}>Estimated</div>
          <div style={{ fontSize: 130, fontWeight: 600, letterSpacing: "-0.04em", color: c.ink, lineHeight: 1 }}>{usd(data.typical)}</div>
        </div>
        <div style={{ transform: `scale(${stampScale}) rotate(${(1 - s) * -8}deg)`, transformOrigin: "0% 50%", opacity: f >= stamp ? 1 : 0 }}>
          <div style={{ fontSize: 34, color: c.muted }}>Actual</div>
          <div style={{ fontSize: 170, fontWeight: 600, letterSpacing: "-0.04em", color: c.money, lineHeight: 1 }}>{usd(data.actualUsd)}</div>
          <div style={{ fontFamily: mono, fontSize: 26, color: c.muted, marginTop: 18, opacity: prog(f, stamp + 14, 10) }}>
            {(data.actualTokens / 1000).toFixed(1)}k tokens · read from the session log
          </div>
        </div>
      </div>
    </Fill>
  );
}

// ─── Wallpaper: everything from the film, scattered, for the ending ──────────────────────────

const STARTERS = ["What will a waitlist page cost?", "Can Haiku ship my checkout?", "Cut this Cursor chat and still ship?", "Plan the MVP, then code one screen?"];

function Wallpaper({ dark, drift }: { dark: boolean; drift: number }) {
  const items = Array.from({ length: 26 }, (_, i) => {
    const x = random(`wx${i}`) * 2300 - 190;
    const y = random(`wy${i}`) * 1300 - 110;
    return { x, y, i };
  });
  const ink = dark ? "#3a3a3a" : "#bdbdbd";
  const border = dark ? "#262626" : c.line;
  const bg = dark ? "#0d0d0d" : "#fff";
  return (
    <AbsoluteFill style={{ transform: `scale(${0.82 + drift * 0.06}) translateY(${-drift * 30}px)` }}>
      {items.map(({ x, y, i }) => {
        const r = runs[i % runs.length];
        const common: CSSProperties = { position: "absolute", left: x, top: y, fontFamily: sans, color: ink, border: `1.5px solid ${border}`, background: bg };
        if (i % 3 === 2) {
          return (
            <div key={i} style={{ ...common, borderRadius: 999, padding: "14px 26px", fontSize: 26, whiteSpace: "nowrap" }}>
              {STARTERS[i % STARTERS.length]}
            </div>
          );
        }
        return (
          <div key={i} style={{ ...common, borderRadius: 22, width: 300, padding: "18px 24px" }}>
            <div style={{ fontSize: 18 }}>{r.model}</div>
            <div style={{ fontSize: 46, fontWeight: 600, letterSpacing: "-0.04em" }}>{usd(r.usd)}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

function GlowMascot({ height, lids }: { height: number; lids: [number, number] }) {
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          inset: -height * 0.7,
          background: "radial-gradient(closest-side, rgba(255,255,255,0.22), rgba(255,255,255,0))",
        }}
      />
      <Mascot height={height} lids={lids} dark style={{ filter: "drop-shadow(0 0 1.5px rgba(255,255,255,0.5))" }} />
    </div>
  );
}

// ─── 8. Black flood ──────────────────────────────────────────────────────────────────────────

export function Flood() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drift = f / 150;
  const radius = interpolate(f, [6, 34], [0, 1300], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const m = pop(f, fps, 28, 11);
  const b = blink(f, 104);

  return (
    <Fill bg={c.bg}>
      <Wallpaper dark={false} drift={drift} />
      <AbsoluteFill style={{ background: c.term, clipPath: `circle(${radius}px at 50% 50%)` }}>
        <Wallpaper dark drift={drift} />
        <AbsoluteFill style={{ background: "radial-gradient(closest-side, rgba(13,13,13,0.95), rgba(13,13,13,0.4))" }} />
        <AbsoluteFill style={{ alignItems: "center" }}>
          <div style={{ position: "absolute", top: 210, transform: `scale(${m})` }}>
            <GlowMascot height={340} lids={[b, b]} />
          </div>
          <Rise words={["Your", "token", "saver."]} at={44} gap={4} size={150} color="#fff" style={{ position: "absolute", top: 640 }} />
          <div style={{ position: "absolute", top: 830, fontFamily: sans, fontSize: 38, color: "#8a8a8a", opacity: prog(f, 66, 14) }}>
            See the cost before you send it, then take the cheaper path.
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </Fill>
  );
}

// ─── 9. Install ──────────────────────────────────────────────────────────────────────────────

export function Cta() {
  const f = useCurrentFrame();
  const cmd = typed(data.cta, f, 8, 32);
  const done = cmd.length === data.cta.length;
  // Wink: right eye shuts at 66 and holds a beat.
  const wink = interpolate(f, [66, 70, 82, 86], [0, 1, 1, 0], clamp);

  return (
    <Fill bg={c.term}>
      <Wallpaper dark drift={1} />
      <AbsoluteFill style={{ background: "radial-gradient(closest-side, rgba(13,13,13,0.97), rgba(13,13,13,0.5))" }} />
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div style={{ position: "absolute", top: 190 }}>
          <GlowMascot height={260} lids={[0, wink]} />
        </div>
        <div
          style={{
            position: "absolute",
            top: 560,
            display: "flex",
            alignItems: "center",
            padding: "30px 48px",
            borderRadius: 999,
            background: "#161616",
            border: "1.5px solid #2a2a2a",
            fontFamily: mono,
            fontSize: 60,
            color: "#fff",
            minWidth: 900,
          }}
        >
          <span style={{ color: "#555", marginRight: 26 }}>$</span>
          {cmd}
          <Caret on={done ? caret(f) : 1} h={64} color="#fff" />
        </div>
        <div style={{ position: "absolute", top: 760, display: "flex", gap: 18, alignItems: "center", fontFamily: sans, fontSize: 40, fontWeight: 500, color: "#fff", opacity: prog(f, 40, 12) }}>
          Abacus
          <span style={{ color: "#5a5a5a", fontWeight: 400 }}>· for Claude Code and Codex</span>
        </div>
      </AbsoluteFill>
    </Fill>
  );
}
