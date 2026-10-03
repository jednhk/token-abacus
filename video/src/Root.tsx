import { Composition } from "remotion";
import { FPS } from "./lib";
import { Launch, TOTAL } from "./Launch";

export function Root() {
  return <Composition id="Launch" component={Launch} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />;
}
