# Abacus — 20s motion spec

The single source of truth for the Remotion build. Every timing is in frames at 30fps.

## 0. Global

| Setting | Value |
|---|---|
| Canvas | 1920 × 1080, 30fps, 600 frames (20.0s) |
| Safe area | 120px horizontal, 90px vertical |
| Background | `#FFFFFF` with the site dot grid: 1.1px dots `#ECECEC`, 22px pitch (scaled ×1.5 for 1080p: 1.6px dots, 33px pitch) |
| Audio | Silent master; cue markers (♪) listed per scene for a later music/SFX pass |

### Palette (black and white only, from `web/`)

| Token | Hex | Use |
|---|---|---|
| `ink` | `#111111` | Text, chips, rods, CTA |
| `bead` | `#0A0A0A` | Bead body, database background |
| `muted` | `#737373` | Secondary text (`neutral-500`) |
| `faint` | `#A3A3A3` | Token IDs, labels (`neutral-400`) |
| `line` | `#E5E5E5` | Hairlines, input border (`neutral-200`) |
| `dot` | `#ECECEC` | Dot grid |
| `paper` | `#FFFFFF` | Background |

No accent colour anywhere.

### Type

| Role | Font | Size / weight / tracking / leading |
|---|---|---|
| Headline | Newsreader | 104px / 500 / -0.03em / 0.98 |
| Wordmark | Geist | 72px / 600 / -0.025em |
| UI text | Geist | 34px / 400 |
| Numbers, tokens, data | Geist Mono | sizes per scene, tabular figures |

### Motion language

| Name | Definition | Use |
|---|---|---|
| `out` | cubic-bezier(0.16, 1, 0.3, 1) | Every entrance |
| `inOut` | cubic-bezier(0.65, 0, 0.35, 1) | Camera and object moves |
| `in` | cubic-bezier(0.7, 0, 0.84, 1) | Exits, objects pulled into the bead |
| `beadSpring` | damping 12, stiffness 180, mass 1 | Bead: exactly one visible overshoot |
| `uiSpring` | damping 20, stiffness 200 | Chips, cards, pills |
| `snapSpring` | damping 26, stiffness 300 | Beads locking onto rods |

Act 1 (frames 0–134) breaks the rules on purpose: 2px positional jitter, 1-frame hard cuts, linear easing. From frame 135 on, nothing jitters.

### Headline slot

- Centred horizontally, baseline at y = 930, max width 1500px.
- **In:** word by word. Each word rises 28px → 0 and opacity 0 → 1 over 16 frames with `out`, 3 frames between words, masked by its own line box.
- **Out:** the whole line, opacity 1 → 0 and blur 0 → 10px over 8 frames with `in`.
- Only one headline on screen at a time.

### The bead (vector rebuild of `web/public/img/mascot.png`)

SVG layers, bottom to top:
1. Contact shadow: ellipse, `#000` at 12%, blur 18px
2. Body: rounded oblate ellipse, ratio 1.25 : 1, radial gradient `#2A2A2A` → `#0A0A0A`
3. Rim gloss: top-left arc, white 18% → 0%
4. Hole: ellipse at top, `#050505`, inner-shadow gradient
5. Eyes: two white circles with black pupils and white catchlights. Pupils are independently addressable for look and dart.
6. Smile: `#5A5A5A` arc, stroke 14px, round caps

Rest height in hero shots is 360px. Squash = scaleX 1.18 / scaleY 0.84 around the bottom centre. Blink = eyelid scaleY 1 → 0.08 → 1 over 6 frames.

---

## Act 1 — The problem

### Scene 1 · "WTF are tokens, even?" · frames 0–74 (0.0–2.5s)

| Frame | Action |
|---|---|
| 0 | White dot grid, static. The site's pill input sits at centre (1200 × 88, radius 44, 1px `line` border, shadow `0 8px 30px rgba(0,0,0,.05)`, black 64px send button with up arrow). |
| 0–30 | The text types in at 2 frames per character in Geist 34px `ink`: **"Build the chat system for blood donors to schedule appointments."** Caret blinks at 15 frames per cycle. ♪ soft key ticks |
| 30–34 | The send button squashes to 0.9 and back. ♪ click |
| 34 | **Shatter.** The pill border disappears, and each token becomes a chip in place: `Build` `▁the` `▁chat` `▁system` `▁for` `▁blood` `▁donors` `▁to` `▁schedule` `▁appointments` `.` |
| | Chip: height 56, padding 0 22, radius 28, 1.5px `ink` border, Geist Mono 28px. A 4-digit token ID sits under each chip in Geist Mono 14px `faint` (illustrative IDs) and flickers through 3 random values over 9 frames before settling. |
| 34–50 | Chips burst outward on `uiSpring` with random rotation of ±12°, spreading to fill the frame. |
| 44–74 | **Expansion.** Each chip splits into 2–3 smaller chips of what the agent would actually touch: `schema.sql` `auth` `calendar_slots` `donor_profile` `sms_reminders` `retry` `tests` `migrations` `▁eligibility` `rate_limit` `webhook`. 120+ chips in total by frame 74, with density building linearly. |
| 40–74 | A token counter at top right (Geist Mono 40px `ink`) climbs linearly from `0 tok` to `1,284,903 tok`. |
| 46 | Headline: **"WTF are tokens, even?"** "WTF" cuts in with no ease (hard cut), and the rest follows the standard word reveal. ♪ hit |
| 70–74 | Headline out. |

### Scene 2 · "Nobody can tell you what it'll cost." · frames 75–134 (2.5–4.5s)

| Frame | Action |
|---|---|
| 75 | Hard cut. The chips stay, but their labels swap in 1 frame to billing terms: `input` `output` `cache write 5m` `cache write 1h` `cache read` `thinking` `fast mode 2×` `per-request tier` `batch` `long context`. |
| 75–134 | **Invoice stack.** A receipt column on the left (Geist Mono 22px, `muted` rows on hairline rules) prints rows upward without stopping: `input ......... 412,330 × $5.00/M`, `cache read .... 2,018,441 × $0.50/M`… It scrolls 14px per frame and speeds up to 40px per frame. |
| 80–134 | **Price guess** at centre, Geist Mono 220px `ink`, swapping on hard cuts: `$3?` (80) → `$30?` (92) → `$4.80?` (100) → `$300?` (108) → `$61?` (114) → `$300?` (118) → `$12?` (121), then every 2 frames from 124. ♪ ticking, accelerating |
| 90–134 | The dot grid warps: radial displacement from centre, amplitude 0 → 14px, noise-driven. 2px chip jitter. |
| 96 | Headline: **"Nobody can tell you what it'll cost."** |
| 134 | Peak chaos. Last frame of jitter. |

---

## Act 2 — The saviour

### Scene 3 · The bead arrives · frames 135–209 (4.5–7.0s)

| Frame | Action |
|---|---|
| 135 | **Freeze.** Every element stops mid-motion: no jitter, no counter, grid warp held. Headline from Scene 2 cuts out. ♪ all audio drops to silence |
| 135–141 | Everything except the centre grid dot desaturates to 35% opacity over 6 frames. |
| 141–150 | **The dot.** The grid dot at exact centre fades from `#ECECEC` to `#0A0A0A` and grows 1.6px → 6px with `out`. |
| 150–168 | **Swell.** The dot morphs into the bead body (eyes closed, no face) with `beadSpring` to 360px tall, one overshoot to about 385px. The circle-to-oblate morph finishes by frame 160. ♪ low swell |
| 150–175 | A halo opens behind the bead: radial white glow, radius 0 → 900px, opacity 0 → 1. It pushes the grid warp flat as it expands. |
| 166 | **Shockwave.** A 1.5px `ink` ring expands from the bead from 380px to 2400px diameter over 14 frames, opacity 0.6 → 0, `out`. |
| 168–192 | **The bead takes in the chaos.** Every frozen chip, receipt row and price fragment gets pulled toward the hole on a spiral path (90° of rotation around the bead), scaling 1 → 0 with `in`, each staggered by its distance (closest first). Each one leaves a 1px `ink` trail at 20% that fades over 6 frames. ♪ rising whoosh, then pop at 192 |
| 192 | Frame is clean: bead, halo, flat dot grid. |
| 194–200 | **Eyes open** (reverse blink, 6 frames). Pupils look at the camera. |
| 200–204 | Smile draws in (stroke-dashoffset 100% → 0). |
| 186–205 | Four hairline rods (1.5px `ink`, 1400px wide, 120px apart, the bead's rod at centre) draw left to right with `inOut`. |
| 196–209 | Four smaller beads (160px) slide in from the edges onto the rods and lock with `snapSpring`, staggered 3 frames apart. Together they form the abacus. ♪ four soft clicks |
| 198 | Headline: **"Skip the tokens."** |
| 205–209 | Headline out. |

### Scene 4 · Task in, cost out · frames 210–284 (7.0–9.5s)

| Frame | Action |
|---|---|
| 210–228 | Camera moves (`inOut`): the abacus slides up to y = 300 and scales to 0.55. The pill input rises in from below to y = 640 on `uiSpring`. |
| 222 | The full task sentence appears in the pill already typed, fading in over 8 frames. Calm, no typing. |
| 232–236 | Send button pressed. ♪ click |
| 236–246 | The sentence lifts out of the pill and flies into the bead's hole with `in`. The pill collapses to its 64px send button and fades. |
| 240–264 | The abacus beads slide along their rods (each with `snapSpring`, staggered 2 frames), like the bead is counting. ♪ bead clicks, one per slide |
| 246–270 | **Odometer** at centre, y = 640: Geist Mono 240px `ink`, each digit on its own rolling drum. It rolls from `$00.00` to **`$38.40`**, right-most digits spinning fastest, digits settling left to right, and the last digit locks at 270 with `snapSpring`. |
| 262–276 | A range bar under the price, 900px wide, 2px `line` track: a p50–p95 segment draws in `ink`, with labels `$24` and `$61` in Geist Mono 22px `muted` at each end. |
| 268–280 | Three model chips tick in under the bar (Geist 22px, 1px `line` border, pill), 3 frames apart: `Opus 5.5 · $38.40` · `Sonnet 5 · $22.10` · `Haiku 4.5 · $6.90`. |
| 252 | Headline: **"Task in. Cost out."** |
| 280–284 | Headline out. |

> All prices are placeholders. Replace them with the real `estimate` response for this prompt before the final render.

### Scene 5 · Evidence readout · frames 285–374 (9.5–12.5s)

| Frame | Action |
|---|---|
| 285–303 | Camera moves (`inOut`): the price block slides left to x = 520 and scales to 0.6. The bead drops into the right third (x = 1440). The rods retract. |
| 290–330 | **Traces.** About 60 hairline paths (1px `ink` at 25%) stream from three labels on the far left edge into the bead's hole. The labels are Geist Mono 20px `faint`, uppercase, letter-spacing 0.12em: `AGENT RUNS` · `EVALS` · `BENCHMARKS`. Each path draws with stroke-dashoffset, staggered by 1 frame. A small 4px dot travels along each path with `inOut`. |
| 312–360 | **Readout panel** at centre, 760px wide, between hairline rules, Geist Mono 30px. Labels in `muted`, values in `ink`. Rows reveal top to bottom, 6 frames apart, and each value counts up from 0 over 12 frames. |
| | `similar tasks ........ 37` |
| | `avg similarity ...... 0.91` |
| | `p50 ............. $38.40` |
| | `p85 ............. $52.10` |
| | `p95 ............. $61.00` |
| | `confidence ......... ● HIGH` (a black dot pulses once, scale 1 → 1.4 → 1) |
| 330 | Headline: **"Grounded in real agent runs."** (Alternative: "Grounded in eval and benchmark traces." Use only if provider benchmark ingestion ships.) |
| 370–374 | Headline out. The panel and traces fade, but the bead stays. |

### Scene 6 · Community · frames 375–449 (12.5–15.0s)

| Frame | Action |
|---|---|
| 375–390 | The bead moves to the centre bottom (y = 820) at 0.7 scale. The rods redraw behind it. |
| 380–420 | **Card cascade.** Six task-feed cards drop into a 3D stack (perspective 1600px, each card rotateX 8°, offset 24px) on `uiSpring`, 5 frames apart. Card: 820 × 112, radius 20, 1px `line` border, white, soft shadow. Task text in Geist 26px `ink`, cost in Geist Mono 26px `ink` on the right, harness label in Geist 18px `faint`. |
| | 1. `Appointment booking chatbot for a clinic` · `$41.20` · Claude Code (front card, nearest match, gets a 1.5px `ink` border at frame 425) |
| | 2. `Volunteer shift scheduler with SMS reminders` · `$33.75` · Codex |
| | 3. `Set up a Caddy reverse proxy` · `$0.42` · Claude Code |
| | 4. `Fix the login redirect bug` · `$1.10` · Cursor |
| | 5. `Add Stripe checkout to a Next.js app` · `$7.80` · Claude Code |
| | 6. `Migrate a REST API to tRPC` · `$12.40` · Codex |
| 395–440 | **Bead rain.** About 40 small beads (24px, no faces) fall onto the rods with gravity easing and land with `snapSpring`, each one a contributor. ♪ cascading clicks |
| 400 | Headline: **"See what it cost everyone else."** |
| 444–449 | Headline out. Cards 2–6 fade, card 1 stays. |

### Scene 7 · Into the database · frames 450–539 (15.0–18.0s)

| Frame | Action |
|---|---|
| 450–468 | The bead moves to the centre and scales to 360px tall. Card 1 shrinks into a dot and flies into the hole. |
| 468–492 | **The dive.** The camera pushes into the bead's hole: the bead scales 1 → 40 around the hole's centre with `in`, the hole fills the frame, and at frame 486 the screen is fully `bead` black. ♪ deep whoosh |
| 486–500 | **Vector field.** Inverted colours. About 2,000 white points (1.5–3px, opacity 20–70%) fade in from depth with a slow parallax drift, as if in 3D (z-scale from 0.6 to 1). |
| 500 | **Your task lands.** A larger white point (10px) with a ring drops in at centre. Geist Mono 18px label: `build chat system · blood donors · scheduling`. |
| 504–520 | **Nearest neighbours.** 12 points light up to full white, staggered 1 frame apart. 1px white lines draw from the task point to each one, and the 0.80 similarity radius draws as a dashed circle. The nearest point shows the label `appointment booking chatbot · $41.20`. |
| 516–530 | Mono readout at bottom left, white 22px: `match_runs → 12 tasks · 0.91 avg similarity · 38 ms` |
| 510 | Headline, white on black: **"The closest match wins."** |
| 534–539 | Headline out. |

### Scene 8 · Resolve · frames 540–599 (18.0–20.0s)

| Frame | Action |
|---|---|
| 540–556 | **Pull-out.** The reverse of the dive: the black field collapses back into the hole, the bead scales 40 → 1 with `out`, and the white dot-grid background returns. ♪ reverse whoosh, then settle |
| 556–562 | The bead lands at 280px with a small squash, then blinks (frames 560–566). |
| 564–580 | **Wordmark.** The bead slides left by 190px with `inOut`, and **"Abacus"** (Geist 600, 72px, -0.025em) reveals to its right, wiped from behind the bead by a mask. This is the header lockup: bead and wordmark, 24px gap. |
| 574 | Tagline under the lockup in Newsreader 500, 56px: **"Task to cost."** |
| 582–592 | A black **Get started** pill (Geist 500, 28px, white text, padding 22 × 44) rises 16px with `uiSpring`. |
| 592–599 | Hold. The bead's pupils glance to the CTA and back. ♪ final soft chime at 592 |

---

## Open decisions

1. **Benchmark claim:** the code today grounds estimates only in recorded agent runs (`estimate` → `match_runs`, 0.80 similarity cutoff, p50/p85/p95, confidence). Keep `EVALS` / `BENCHMARKS` as trace sources only if benchmark ingestion ships.
2. **Real numbers:** run the blood-donor prompt through `estimate` and replace `$38.40`, `$24–$61`, the model prices and the readout.
3. **9:16 cut:** not specced yet. It would reflow headlines to 2 lines and stack the lockup vertically.
4. **End card:** "Abacus" vs "Token Abacus", plus URL.

---

## Build notes (where the code departs from the text above)

- **Rods are vertical.** A real abacus bead is threaded through its hole, so the rods run vertically through the beads and beads slide up and down. Five rods at local x = −620, −360, 0, 360, 620, each 760px tall (`RODS_X`, `ROD_HALF` in `src/timeline.ts`). The hero bead sits on the centre rod.
- **The hero bead and all headlines are drawn by `src/Video.tsx`** from `heroBead(f)` in `src/timeline.ts`. Scenes never draw the hero bead, and they read its position with `heroBead(f)` / `heroHole(f)`.
- **Scene 4 layout:** abacus at y = 250, scale 0.45. Odometer 200px centred at y = 560, range bar at y = 690, model chips at y = 750, so nothing collides with the headline slot (baseline 930).
- **Scene 5 layout:** the price block fades out instead of sliding left (the readout repeats p50). Bead at (1500, 540), scale 0.6. Readout panel centred at x = 860, 680px wide. Trace labels at x = 120.
- **Scene 6 layout:** cards in a column centred at x = 800 (760 × 92, 12px gap, y from 150). Three rods on the right at x = 1480 / 1600 / 1720 from y = 380 to 760. The hero bead sits at the top of the centre rod (1600, 300, scale 0.45), and 40 rain beads stack from the bottom of the rods.
- **Scene 8 lockup:** bead scale 0.5 at (781, 440), wordmark 104px starting at x = 921 (`LOCKUP` in `src/timeline.ts`). Tagline at y = 590, CTA at y = 700.
- **Scene 2 headline** is 96px so it fits on one line.
