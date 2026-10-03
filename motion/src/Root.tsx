import { Composition } from "remotion";
import { Video } from "./Video";
import { DURATION, FPS, HEIGHT, WIDTH } from "./theme";

export const Root = () => (
  <Composition
    id="Abacus"
    component={Video}
    durationInFrames={DURATION}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
