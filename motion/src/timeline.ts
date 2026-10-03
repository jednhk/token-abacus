import { BeadProps, HOLE_OFFSET_Y, holeAt } from "./Bead";
import { CX, CY, E, kf, lerp, spr, tw } from "./theme";

// Scene boundaries (absolute frames, 30fps). See STORYBOARD.md.
export const S = {
  tokens: [0, 75],
  cost: [75, 135],
  saviour: [135, 210],
  estimate: [210, 285],
  evidence: [285, 375],
  community: [375, 450],
  database: [450, 540],
  resolve: [540, 600],
} as const;

/** End-card lockup: bead + "Abacus" wordmark, like the site header. Owned by scenes/Lockup.tsx. */
export const LOCKUP = {
  bead: { x: 781, y: 440, scale: 0.5 },
  wordmarkLeft: 921,
  wordmarkSize: 104,
  taglineY: 590,
  ctaY: 700,
};

/**
 * The abacus group (Scenes 3–4): five vertical rods, the hero bead on the centre rod.
 * Local coordinates are pixels at group scale 1, origin at the hero bead's rest position.
 */
export const RODS_X = [-620, -360, 0, 360, 620];
export const ROD_HALF = 380;

export function abacusGroup(f: number) {
  return {
    x: CX,
    y: kf(f, [[210, CY], [228, 250]]),
    scale: kf(f, [[210, 1], [228, 0.45]]),
  };
}

/** The hero bead's local y on the centre rod: it slides like it's counting (Scene 4). */
function counting(f: number) {
  return kf(f, [[240, 0], [248, -70], [256, 40], [264, 0]], E.inOut);
}

type BeadState = Omit<BeadProps, "id"> & { visible: boolean };

/** Where the hero bead is, how big, and what its face is doing, on every frame. */
export function heroBead(f: number): BeadState {
  const base = { face: true, eyes: 1, smile: 1, look: { x: 0, y: 0 }, squash: 0, widthFactor: 1, opacity: 1 };
  const hidden = { ...base, x: 0, y: 0, scale: 0, visible: false };

  // Act 1 and the freeze: the bead doesn't exist yet (DotGrid draws the centre dot at 141–150).
  if (f < 150) return hidden;

  // Face: closed and faceless until 194, eyes open 194–200, smile draws 200–204.
  const face = f >= 194;
  const eyes = blink(f, tw(f, 194, 200, 0, 1, E.out));
  const smile = tw(f, 200, 204, 0, 1, E.out);
  const look = lookAt(f);

  // Scenes 3–4: on the abacus.
  if (f < 285) {
    const g = abacusGroup(f);
    const swell = f < 210 ? spr(f, 150, "bead") : 1;
    return {
      ...base,
      visible: true,
      x: g.x,
      y: g.y + counting(f) * g.scale,
      scale: g.scale * swell,
      widthFactor: kf(f, [[150, 0.8], [160, 1]]),
      face,
      eyes,
      smile,
      look,
    };
  }

  // Scenes 5–7 up to the dive: glide between staging positions.
  if (f < 468) {
    const g = abacusGroup(284);
    // Start (end of Scene 4) → Evidence (right third) → Community (top of the rods) → Database.
    const stage = (start: number, evidence: number, community: number, database: number) =>
      kf(f, [[285, start], [303, evidence], [375, evidence], [390, community], [450, community], [468, database]]);
    return {
      ...base,
      visible: true,
      x: stage(g.x, 1500, 1600, CX),
      y: stage(g.y, 540, 300, 600),
      scale: stage(g.scale, 0.6, 0.45, 1),
      face,
      eyes,
      smile,
      look,
    };
  }

  // Scene 7 dive: scale 1 → 40 around the hole, which travels to screen centre.
  if (f < 486) {
    const t = tw(f, 468, 486, 0, 1, E.in);
    const scale = Math.exp(lerp(0, Math.log(40), t));
    const holeY = lerp(600 - HOLE_OFFSET_Y, CY, t);
    return { ...base, visible: true, x: CX, y: holeY + HOLE_OFFSET_Y * scale, scale, shadow: false, eyes, look };
  }

  // Inside the database: no bead.
  if (f < 540) return hidden;

  // Scene 8 pull-out: 40 → lockup scale, then slide left into the lockup.
  const { bead: L } = LOCKUP;
  const t = tw(f, 540, 556, 0, 1, E.out);
  const scale = Math.exp(lerp(Math.log(40), Math.log(L.scale), t));
  const holeY = lerp(CY, L.y - HOLE_OFFSET_Y * L.scale, t);
  return {
    ...base,
    visible: true,
    x: kf(f, [[564, CX], [580, L.x]]),
    y: holeY + HOLE_OFFSET_Y * scale,
    scale,
    squash: kf(f, [[554, 0], [557, 1], [562, 0]], E.out),
    shadow: t > 0.9,
    eyes,
    look,
  };
}

function blink(f: number, open: number) {
  for (const at of [330, 560]) {
    if (f >= at && f < at + 6) return kf(f, [[at, 1], [at + 3, 0.08], [at + 6, 1]]);
  }
  return open;
}

function lookAt(f: number) {
  // Scene 4: watch the odometer below. Scenes 5–6: look left at the panel / cards.
  // Scene 8: glance at the CTA and back.
  const x = kf(f, [[240, 0], [248, 0], [290, -0.8], [440, -0.8], [455, 0], [592, 0], [595, 0.6], [599, 0.6]]);
  const y = kf(f, [[240, 0], [248, 0.7], [276, 0.7], [290, 0], [592, 0], [595, 0.7], [599, 0.7]]);
  return { x, y };
}

/** Screen position of the hero bead's hole (for things that get pulled in). */
export function heroHole(f: number) {
  const b = heroBead(f);
  return holeAt(b.x, b.y, b.scale);
}
