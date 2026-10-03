import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Bead } from "./Bead";
import { DotGrid } from "./DotGrid";
import { Headline } from "./Headline";
import { Chaos } from "./scenes/Chaos";
import { Community } from "./scenes/Community";
import { Database } from "./scenes/Database";
import { Estimate } from "./scenes/Estimate";
import { Evidence } from "./scenes/Evidence";
import { Lockup } from "./scenes/Lockup";
import { Saviour } from "./scenes/Saviour";
import { C } from "./theme";
import { heroBead } from "./timeline";

/*
 * Contract for scene files (src/scenes/*.tsx):
 * - Each scene is `({ f }: { f: number }) => JSX | null`, where f is the ABSOLUTE frame (0–599).
 *   Frame numbers in code match STORYBOARD.md one to one. Return null outside your frames.
 * - Scenes render full-frame absolutely positioned layers (1920×1080). Use theme.ts for colours,
 *   fonts, easings, springs (spr), tweens (tw) and keyframes (kf). No other colours.
 * - The hero bead and the headlines are drawn here, not in scenes. Read the bead's position
 *   with heroBead(f) / heroHole(f) from timeline.ts. Faceless beads: <Bead face={false} ... />.
 * - Layer order: background → dot grid → scenes "behind" → hero bead → scenes "front" → headline.
 *   A scene that needs both passes takes a `layer` prop.
 */
export function Video() {
  const f = useCurrentFrame();
  const bead = heroBead(f);
  const inDatabase = f >= 486 && f < 540;
  return (
    <AbsoluteFill style={{ background: inDatabase ? C.bead : C.paper, overflow: "hidden" }}>
      <DotGrid f={f} />
      <Saviour f={f} layer="behind" />
      <Evidence f={f} />
      <Community f={f} />
      <Database f={f} />
      <Estimate f={f} layer="behind" />
      {bead.visible ? <Bead {...bead} id="hero" /> : null}
      <Saviour f={f} layer="front" />
      <Estimate f={f} layer="front" />
      <Chaos f={f} />
      <Lockup f={f} />
      <Headlines f={f} />
    </AbsoluteFill>
  );
}

function Headlines({ f }: { f: number }) {
  return (
    <>
      <Headline f={f} text="WTF are tokens, even?" inAt={46} outAt={70} hardCut={[0]} glow />
      <Headline f={f} text="Nobody can tell you what it'll cost." inAt={96} cutAt={135} glow size={96} />
      <Headline f={f} text="Skip the tokens." inAt={198} outAt={205} />
      <Headline f={f} text="Task in. Cost out." inAt={252} outAt={280} />
      <Headline f={f} text="Grounded in real agent runs." inAt={330} outAt={370} />
      <Headline f={f} text="See what it cost everyone else." inAt={400} outAt={444} />
      <Headline f={f} text="The closest match wins." inAt={510} outAt={534} color={C.paper} />
    </>
  );
}
