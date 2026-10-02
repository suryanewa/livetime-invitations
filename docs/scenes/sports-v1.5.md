# Sports v1.5: a real hoop, real bounces, a real net

Surya's three Sports edits from the perfection pass (`docs/perfection-pass-brief.md`):

- **#7** "The basketball hoop looks far too childish because of its weird proportions / height."
- **#8** "Better bounce physics for the ball."
- **#9** "Better net physics as the ball passes through the hoop."

The beats are unchanged: host 1.2 s, accept 1.7 s with net contact at 0.95 s, decline 1.6 s.

Files changed: `models/sportsContract.ts` (proportions, stand, pivots), `models/sportsPremium.ts` (the stand),
`models/sportsNet.ts` (new: the net's lattice, simulation, skinning and hoop springs), `models/sports.ts` (rig),
`src/scenes/sports/ballPhysics.ts` (new: the ball's physics), `src/scenes/sports/sequences.ts` (choreography on
physics tracks), `src/scenes/sports/index.ts` (tails, live net, framing points, interruption), `src/render/materials.ts`
(two stand materials), `scripts/masters/recipes/sports.ts` (comments only), the tests, and `assets/scenes/sports/sports.glb`.

## #7 Proportions: what the scene depicted, and what it depicts now

### Why it read as a toy

| | v1.4 | v1.5 | Regulation | Mini hoop system (SKLZ Pro Mini Hoop System) |
| --- | --- | --- | --- | --- |
| Ball | 18 cm mini | 18 cm mini | 23.9 cm (size 7) | 7" (17.8 cm) |
| Rim inner diameter | 28.8 cm | **36.8 cm (14.5")** | 45.7 cm | 14.5" (36.8 cm) |
| Ball / rim (rim / ball) | 0.625 (1.60) | **0.489 (2.05)** | 0.52 (1.91) | 0.48 (2.07) |
| Rim height (top of ring) | 61.9 cm | **121.9 cm (4 ft)** | 305 cm | 3.5–7 ft (107–213 cm) |
| Rim height / ball diameter | 3.4 | **6.8** | 12.8 | 5.9–11.8 |
| Rim height / rim diameter | 2.15 | **3.31** | 6.7 | 2.9–5.8 |
| Board (frame) | 58.6 × 46.0 cm | **74.9 × 58.9 cm** | 183 × 107 cm | 33 × 23" (84 × 58 cm) |
| Board width / rim | 2.03 | 2.03 (the master's) | 4.0 | 2.28 |
| **Rim height / board width** | **1.06** | **1.63** | **1.67** | 1.27–2.5 |
| Pole below the board / board height | 1.13 | **1.84** | 2.7 | 1.6–3.4 |
| Rim-to-board gap | 1.7 cm (0.061 × rim) | 2.2 cm (0.061 × rim, the master's bracket) | 15 cm (0.33) | mini bracket |
| Net length / rim | 24.6 cm (0.855) | 31.5 cm (0.855) | 40 cm (0.875) | |
| Net bottom / ball | 0.80 | 1.02 (the master's taper; the ball still opens it) | ≈ 1.1 | |
| Stand | 3.2 cm pole, 21.6 cm round lamp base, rim over the base | **5.1/4.5 cm telescoping pole leaning 13.8°, 51 × 65 × 13 cm weighted base behind the board, rim 66 cm in front of the base** | in-ground pole, 2–4 ft overhang | steel pole, 80 × 51 × 16 cm weighted base |

Diagnosis: the old hoop stood with its rim at knee height (3.4 ball diameters up) on a short pole with a round lamp base,
its board nearly as wide as the rim was high (1.06; a court's is 1.67), and the ball 0.625 of the rim (a toy's ratio;
real hoops of every size keep it near 0.5). Together they read as a toddler's toy. Sources: sklz.com (Pro Mini Hoop
System: 33 × 23" board, 14.5" rim, 7" ball, 3.5–7 ft, base 31.6 × 20 × 6.3"; Pro Mini Hoop XL: 23 × 16" board,
9.5" rim, 5" ball, 8-loop net), FIBA/NBA regulation dimensions.

### The decision

One product: a **mini hoop system of the SKLZ Pro Mini Hoop System class, at its 4 ft setting**
(`HOOP_PRODUCT_CM`). The hoop master's geometry is kept and scaled uniformly (`HOOP_SCALE` 0.88692 → 1.13421) so its
rim is the product's 14.5" rim (ball / rim 0.49); the rim stands at 4 ft, the setting at which the system has a
regulation hoop's silhouette (rim height / board width 1.63 vs 1.67). Every hoop number in the contract is now derived
from the master's own scan measurements (`HOOP_MASTER`, `hoopFromMaster`), not hand-copied.

The stand is redesigned as a **portable system** (`STAND`, `POLE`, `sportsPremium.ts buildMasterStand`): a blow-moulded
weighted base (satin HDPE, rolled top edge, recessed foot, fill cap, wheels at the back) entirely behind the board; a
telescoping powder-coated steel pole (2" lower, 1¾" upper, clamp collar with a pin knob) leaning forward 13.8° from a
socket near the base's front; a sleeve at its head carrying two parallel box-section arms to a steel plate on the board's
back. Two new library materials, `mat_stand_plastic` and `mat_stand_steel` (satin HDPE; black powder coat). The base
contact blob is now rectangular.

The base sits behind the board for the same reason real portables do: with the camera at 15° elevation, anything
bouncing just in front of a base drawn under the rim reads as bouncing *on* it (the first v1.5 stand, a vertical pole
with the base under the rim, failed exactly that way; see the inspection below).

### Framing and the ball's size

Layout (sports_root, scene units): `HOOP_ROOT` (0.62, 0, −1.0), guest (−0.72, 0.92), host (1.95, 0.35); the wall moves
back to −5.4 so the base, the declined rest and every bounce sit on flat floor. `SPORTS_BOUNDS` (key-light aim, lookdev)
covers every path including the tails. The hero rule holds unchanged: hero height 0.600 of the frame at 3:4, 1:1 and
3:2, not path-limited, centred (browser `framing.spec.ts`).

The cost of real proportions is the ball's screen size: the hero is now 1.7× taller, so the ball is **5.9 % of the
frame height** (v1.4: ≈ 9–10 %), 42 px on a 720 px poster, ≈ 22 CSS px on a 390 px phone. The v1.4 gap ("the ball
reads small beside the hoop") is therefore wider, by design: it is the real ratio of a 7" ball to a 4 ft mini system,
and the owner's complaint was that the hoop looked like a toy. The 3.5 ft setting would have given +9 % ball size and
a more junior silhouette (1.43); rejected. A unit test holds the ball at ≥ 5.5 % of the frame.

## #8 The ball: a physics model, integrated once

`src/scenes/sports/ballPhysics.ts`. Each sequence is the approved authored gather (0–0.2 s) followed by a **physical
track** integrated at module load from a solved launch state into keyframes (cubic Hermite on position with exact
velocities, which reproduces every parabola and constant deceleration exactly; slerp on orientation, exact for constant
spin; Hermite on squash). Pure in t, replay-safe, deterministic.

| Constant | Value | Source / reason |
| --- | --- | --- |
| Gravity | 9.81 m/s² = **27.25 su/s²** (1 su = 36 cm; 49.05 world u/s² ÷ the 1.8 root scale) | v1.4's derived 0.78 g is gone |
| Normal restitution e | **0.82** | FIBA: 1.8 m drop → 1.2–1.4 m (e 0.816–0.882); brief 0.76–0.84. Test: a 1.8 m drop rebounds to 121 cm |
| Sliding friction μ | 0.6 | pebbled rubber on a hard floor |
| Tangential restitution e_t | 0.15 | Cross 2005: grip near normal incidence, e_x 0–0.2 |
| Moment of inertia | I = ⅔ m R² | hollow shell |
| Rolling resistance c_rr | 0.02 → 0.33 su/s² | rubber ball on a painted studio floor (hardwood ≈ 0.01) |
| Squash | 10 % of the diameter at 5.94 m/s, linear in impact speed | brief; a linear spring with that compression at that speed contacts for 9.5 ms |
| Drawn contact | 30 ms (real ≈ 10 ms) | so a 60 fps frame always catches it; the bottom stays exactly on the floor and the centre dips by the compression; no stretch (not rubbery) |
| Bounce stop | rebound < 0.25 su/s (a 1 mm hop) | then slide → grip → roll to a stop: no micro-bounces |
| Air drag, Magnus | omitted (≈ 7 % and 2 % of g at the shot's top speed) | so each flight is an exact parabola |

Contacts are impulses after Cross: the contact point's tangential velocity is reversed by e_t when the ball grips, else
μ limits the impulse; angular momentum about the contact point is conserved (unit-tested). So a backspinning ball checks
up, a topspinning one runs on, and a ball without spin leaves nearly rolling.

| Sequence | Launch | Contacts | First impact → rebound | Peak squash | Comes to rest |
| --- | --- | --- | --- | --- | --- |
| Accept | solved to pass the rim centre at 0.95 s (apex 0.71 su = 26 cm above the rim, 72° entry), 2.5 rev/s backspin | 20 | 3.99 m/s → 54 cm hop | 6.7 % | 6.27 s, 0.97 su in front of the landing, clear of the base |
| Decline | solved to land on `MISS_LAND` behind and left of the board, 2.2 rev/s backspin; passes rim height 1.21 su screen-left of the rim | 21 | 4.95 m/s → 84 cm hop; the backspin all but cancels its run (v − α R ω ≈ 0), it checks and dies in place | 8.3 % | 6.41 s |
| Host | a low bounce pass, 1.9 rev/s backspin; its speed solved (bisection) so it rests exactly on the guest spot | 15 | 1.6 m/s, checks, hops 9 → 1 cm, rolls into place | 2.7 % | 4.33 s |

**The net on the ball** (`NetDrag`): while the ball's cross-section reaches past the net's rest envelope it is braked
in proportion to the overlap (rate solved so it leaves falling at 0.6 × its entry speed: 6.23 → 3.80 su/s), its drift
towards the board is handed back out (0.34 su/s towards the camera) and its backspin is gripped. Peak deceleration
2.6 g.

**Tails.** A real ball keeps bouncing for seconds after the beat that matters. The director's durations stay the
approved ones; the rest of each track is the sequence's tail, which `SportsScene` plays in its continuous channel:
when the director ends a sequence with `pose(final)` right after sampling it, the scene starts the tail; `simulate`
advances it at the fixed step, `settling()` keeps the loop running until it ends, and `settle()` snaps it to its end.
The canonical poses (posters, reduced motion) are the tracks' rest states. An interruption during a tail cuts (spec
revision #9: a blend would first snap the ball to rest). The browser test that compares the settled made frame with the
canonical pose now waits for the tail (≈ 4.6 s).

The seam frame: guest-ready keeps the exact v1.2 orientation (`GUEST_ROT`), so `SEAM_FRAME` still shows "( + )"; the
host-ready orientation is whatever makes the physical pass end in it.

## #9 The net: the master's cord lattice, simulated and skinned

`models/sportsNet.ts`.

- **Lattice read from the master** (`analyseNet`): the master net is a knotted diamond net whose every cord piece and
  knot half is its own mesh component. Its structure is read back at load: **10 loop attachments** (pinned to the rim),
  **6 rows × 10 knots** (the simulated nodes), **120 cord pieces** (loops → first row, then each knot to two below),
  10 tails. Validated in a unit test against the exported GLB.
- **Simulation** (`NetSim`): Verlet positions with XPBD constraints, **4 substeps per 1/120 s fixed step** (1/480 s),
  one pass each. Gravity 9.81 m/s². Mass 40 g over the knots (±10 % seeded jitter, mulberry32 seed 7). Cords: tension-only
  (slack in compression), compliance **0.012 su/N** (a 5 cm piece stretches 9 %/N, braided nylon). Shear springs on both
  diamond diagonals, compliance **0.4 su/N** (the knots' and braid's stiffness: the net keeps open diamonds). Air drag
  **0.8 /s**. Ball contact: knots inside the ball sphere (+ 1.8 cm knot radius) are pushed out along its normal, their
  tangential velocity relative to the ball's surface cut by **70 %** (the leather's grip). The board face is a wall. The
  hanging rest pose is the equilibrium under gravity (≤ 1.3 mm from the master's shape), solved once at load (15–19 ms).
  The net steps along the ball's own track (its time advanced by the fixed step), not frame to frame.
- **Rendering** (`NetSkin`): the strands and knots become `SkinnedMesh`es with one bone per cord piece (frame along the
  cord, radial, binormal; stretched with the cord) and one per knot; **190 bones**, the GPU skins ~76k vertices (the
  shadow pass too). The loops stay on the rim. The skeleton's bone texture is freed with the scene.
- **What it does** (unit test on the GLB lattice, accept track): woken as the ball nears, knots pushed up to 7 cm out
  round the ball and never inside it; dragged down, the net's bottom flips up **6 cm** above where it hangs as the ball
  leaves (the whip), swings, is visibly still (every knot within 3.6 mm of rest) 2 s after the ball has left, and snaps
  to rest when its last sub-millimetre sway dies (≈ 4 s). The decline and host never wake it.
- **Rim and board** (`HoopSprings`): the pinned constraints' multipliers give the net's actual pull on the hooks (peak
  ≈ 6 N on a swish; its change from the hanging net's own 0.39 N drives the springs). The spring-action rim: I 0.045
  kg·m², 80 N·m/rad, ζ 0.15 (7 Hz), with a hard **back stop at −0.42°** where the bracket plate meets the board face;
  the board on its pole: I 0.27 kg·m², 2500 N·m/rad, ζ 0.06 (15 Hz). Measured on the swish: **rim +1.3°, back onto its
  stop; board 0.05°**. The fixed 2.5°/0.6° of v1.2 is gone.
- **Interruptions**: the director settles before it cuts or blends; the scene keeps the net's motion across that settle
  (`refresh()` restores it), so a change of mind with the ball in the net leaves the net swinging. Reduced motion,
  replay and reset never refresh, so there the net stays snapped to rest.

### Frame cost (this laptop, M2 Pro)

- Node (V8) micro-benchmarks, over several runs: net simulation **0.08–0.13 ms per 60 fps frame** (two fixed steps,
  ball in the net); bones from the simulation + matrices + skeleton **0.05–0.08 ms**. Load, once: lattice analysis
  27–47 ms, rest relaxation 15–19 ms.
- Headless Chrome, 390 × 844 @3x, Normal tier, vsync off (frame time = work): accept p50 **1.1 ms** / p95 3.3 ms during
  the sequence, p50 1.6 ms / p95 3.3 ms during the tail (ball + net); decline the same. With vsync: p50 16.7 ms, p95
  16.8 ms, no dropped frames.

## Inspection (adversarial) and fixes

Judged on the frames in `evidence/v1.5/sports/` as a hostile reviewer:

1. *The made ball bounces on the base.* First v1.5 stand (vertical pole, base under the rim): every bounce overlapped
   the base's top on screen. **Fixed**: portable stand, base behind the board, pole leaning; hoop moved forward, wall
   back. Now the floor contacts are below the base's front edge with the contact shadow on the floor in front.
2. *The base looks like lacquered piano black, the edge faceted.* **Fixed**: satin HDPE and powder-coat materials, a
   true rolled edge.
3. *The airball rolls off into the studio* (with 2.8 rev/s and a short throw it came back 3.8 su; with the first
   layout it ran into the cove). **Fixed**: the airball is defined by where it lands and its 2.2 rev/s backspin all but
   cancels its run.
4. *The net barely whips.* With stiff cords and μ 0.5 the bottom lifted 3.7 cm and the swing died in ≈ 1 s. **Fixed**:
   nylon-elastic cords and the leather's grip: 6 cm flip, visible sway to ≈ 2 s.
5. *The rim jumps when the net wakes* (the hanging net's own weight torque appeared from 0). **Fixed**: the springs feel
   only the change from the hanging net's pull. *The rim swings back through the board.* **Fixed**: hard back stop.
6. *A drawn ball dips into the floor by 10 µm mid-contact* (squash interpolated linearly against a Hermite centre).
   **Fixed**: squash is Hermite-interpolated with its rate, so the bottom is exactly on the floor through every contact.
7. *A bone texture leaks per scene visit* (browser Low-tier test). **Fixed**: the skeleton is disposed with the rig.

Still open (judged acceptable, recorded):
- The ball is smaller on screen than in v1.4 (5.9 % of the frame height): the cost of real proportions (above).
- The host pass's tail is a 2.5 s slow roll into the guest spot: with c_rr 0.02 a ball delivered to rest at a spot
  either rolls slowly or bounces many times; physics, not choreography.
- The made and declined tails last ≈ 4.5–4.8 s past the beat (≈ 20 bounces dying from 54 / 84 cm). Real, and the
  render loop idles afterwards; an interruption during a tail is a cut.
- The squash reads on 1–2 frames at 60 fps and is 2–3 px at 540 px (physical amplitudes).
- The hoop's cast shadow still climbs the cove at the right (as in v1.4).
- The rim recoil (≈ 1.3°, ≈ 1–2 px at 540 px) is real-sized, so barely visible; the net carries the swish.
- The lookdev page's v1.1 code-authored hoop keeps its own net, which the lattice analysis rejects: it stays static.

## Tests

Unit (`pnpm test`): **286 passed** (`tests/sports.test.ts` rewritten: 43 tests on the proportions, the physics model,
the choreography, ballistics, spin, legibility, interruption, the GLB and the simulated net; `tests/world-scale.test.ts`
updated). Browser (`pnpm test:browser`): **87 passed** (the sports spec now waits for the tail; framing, fullscreen and
idle unchanged and passing). `pnpm typecheck` clean.

## Evidence (`evidence/v1.5/sports/`)

- `stills/`: `v1.4-before-guest-ready.png`, `v1.4-before-fullscreen-1440x900.png`; `v1.5-{host-ready,guest-ready,accepted,declined}.png`
  (720 px), `v1.5-cream-{guest-ready,accepted,declined}.png` (1080 px), `fullscreen-{desktop-1440x900,tablet-768x1024,phone-390x844}-{guest,accepted}.png`,
  `v1.5-stand-closeup.png`.
- `strips/` (`scripts/sports-strips.ts`: a 62.5 fps virtual clock, 16 ms per frame, as `pnpm capture`): `accept-overview-every6.jpg`,
  `decline-overview-every6.jpg`, `host-overview-every6.jpg` (7.5 s, tails included), `accept-shot-and-passage-every-frame.jpg`,
  `accept-net-passage-60fps.jpg`, `accept-net-whip-and-settle-every2.jpg`, `accept-bounces-every3.jpg`,
  `{accept,decline}-first-landing-60fps.jpg`, `change-accept-to-decline-in-net.jpg`.
- `motion/`: `accept.mp4`, `decline.mp4`, `host.mp4` (7.5 s at 60 fps), `accept-net-closeup.mp4`, `change-accept-to-decline-in-net.mp4`.

`pnpm models sports` is deterministic (two exports, SHA-256 7546501e…e755 both times): 263,098 triangles, 12 draw
calls (+ 1 shadow proxy), 23 nodes. The Sports posters (both presets, four poses), the collection thumbnail and the
Sports fullscreen backdrop were regenerated (`pnpm capture sports`, `pnpm capture backdrops`: only Sports' backdrop
changed, the other four came out byte-identical and were left alone).
