import { Series } from "remotion";
import { Actual, Cta, Flood, Meet, Meter, NobodyKnows, Precedent, RollDown, Terminal } from "./scenes";

// Every duration is a whole number of beats (15 frames at 120 BPM), so every cut lands on one.
export const SCENES = [
  { name: "terminal", frames: 90, C: Terminal },
  { name: "meter", frames: 120, C: Meter },
  { name: "nobody", frames: 60, C: NobodyKnows },
  { name: "meet", frames: 90, C: Meet },
  { name: "precedent", frames: 210, C: Precedent },
  { name: "rolldown", frames: 150, C: RollDown },
  { name: "actual", frames: 150, C: Actual },
  { name: "flood", frames: 150, C: Flood },
  { name: "cta", frames: 120, C: Cta },
];

export const TOTAL = SCENES.reduce((n, s) => n + s.frames, 0);

export function Launch() {
  return (
    <Series>
      {SCENES.map(({ name, frames, C }) => (
        <Series.Sequence key={name} durationInFrames={frames} name={name}>
          <C />
        </Series.Sequence>
      ))}
    </Series>
  );
}
