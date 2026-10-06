# Sports v1.7: the decline banks off the glass, and the frame is the board and the ball (#43)

Surya, 2026-10-06: *"For the basketball decline animation, I think it should bounce off the backboard and not go in in a
more dramatic way. I also think it would look better bigger by cutting the bottom of the board and making it more focused
on the backboard and ball."* Decision #43 (`docs/revisions-v1.7-brief.md`): a hard, high bank off the glass on the 0.95 s
beat, a rattle on the ring, a carom out front-left, never in; the hero becomes board + rim + net + ball at the largest
fill that keeps every path inside the clearance.

Branch `v1.7/sports-decline` from `v1.7/integration` a157690, merged with the net rebuild (836b448) on the way. Files:
`src/scenes/sports/{ballPhysics,sequences,change,index}.ts`, `models/sportsContract.ts` (the face opening,
`SPORTS_BOUNDS`), `src/core/sequence.ts` + `src/core/controller.ts` + `src/render/stage.ts` (one optional `heroFill`
threaded through; shared with the Dinner owner's close-up, both kept), `tests/sports.test.ts`,
`tests/stage-framing.test.ts`, `tests/browser/{framing,sports}.spec.ts`, `scripts/sports-strips.ts` (real-stage views),
`scripts/capture.ts` (the sports decline clip; `CAPTURE_NO_CLIPS`), the Sports posters, thumbnail and backdrop, this
file, `docs/spec-revisions.md` (#43). The recoil block of the contract (pivots, `RECOIL_LIMIT`, `RIM_BACKSTOP`,
`recoilPoint`) is **unchanged**; `HoopSprings` is the net owner's and is only called (`kick`).

## Research (sources)

| Quantity | Value used | Source |
| --- | --- | --- |
| Backboard restitution (ball and board together) | **0.72** | FIBA Official Basketball Rules, Basketball Equipment (2020/2024, Level 1): a ball dropped on the backboard from 1.8 m rebounds at least 50 % of the height, so e ≥ √0.5 = 0.707; Min, *Application of Monte Carlo Simulations to Improve Basketball Shooting Strategy* (arXiv:1606.08145, 2016) uses 0.75 for the bank. A mini system's laminate board on a telescoping pole gives a little more than a court's glass: 0.72, under the floor's 0.77 (the ball alone, FIBA 2026, v1.5). |
| Backboard sliding friction | **0.6** | Hubbard et al., *Determining friction coefficients for round balls* (ISEA): static ≈ 1.0 for basketballs on glass; a sliding coefficient sits below it and above the rim's. |
| Rim restitution | **0.6** | FIBA: the ring and its support absorb 35–50 % of the impact energy; the ball's own losses at a rigid contact are its 0.77 (41 %), so 0.77 × √(1 − 0.4) ≈ 0.60 (band 0.54–0.62, unit-tested). The ring's share is drawn by the recoil (`HoopSprings.kick`). |
| Rim friction | **0.5** | Okubo & Hubbard, *Identification of basketball parameters for a simulation model* (Procedia Engineering 2, 3281–3286, 2010): a basketball on a rim, slip tests. |
| Tangential restitution (grip) | 0.15 | Cross, *Grip-slip behavior of a bouncing ball* (Am. J. Phys. 70, 1093, 2002) and *Bounce of a spinning ball near normal incidence* (73, 914, 2005): the same ball as on the floor. |
| Spin on a bank | — | Cross (2002, 2005): the contact point's slip decides: a ball rising into the glass with backspin slides up it, friction drives it down and turns the spin; one falling onto it slides down and leaves overspinning. Min (2016): backspin gains downward speed off the board. Okubo & Hubbard, *Dynamics of basketball–rim interactions* (Sports Engineering 7, 15–29, 2004): ball–rim outcomes are extremely sensitive to the contact point and the backspin (so the bank point is chosen, below, and locked by tests). |
| Ball mass | 0.298 kg | `BALL_MASS_KG` (Spalding size 3, 10.5 oz), the pre-split's. |
| What a dramatic miss looks like | — | Broadcast and film: the "too strong" bank that kicks off the glass, hangs and **rattles on the ring** ("in and out") before falling off it, the ring shuddering on its spring, then the ball bouncing away; the tension is the ball on the rim. |

## What the kinematics allow (the exploration, before building)

- **The shared gather cannot strike hard.** From the guest spot, 40 cm in front of the board's plane, released at 0.2 s,
  the glass at 0.95 s is met at Δz / 0.75 s = **0.53 m/s square on, whatever the arc**, coming down at ≈ 1.8 m/s: a kiss.
  It drops through the ring for any bank behind it (x ≥ 0.3 su); left of it, it clangs the ring's back-left and runs.
- **A backspin bank that comes down leaves overspinning** (R·ω ≈ 4.8 su/s against 1 su/s forward), so its first floor
  bounce kicks it on at 1 m/s.
- **No honest carom comes to rest in frame.** A sweep over the face (x −0.3…1.5, y 3.9…4.45 su), the release (0.2–0.65 s),
  2–2.5 rev/s and μ_rim 0.25–0.5 (≈ 40 000 runs, `scripts/_scratch/`): every carom off the ring rolls ≥ 2 su (≥ 72 cm)
  past the frame's edge, most 5–50 su. A rubber ball on a studio floor (c_rr 0.02, 0.12 m/s²) rolls metres from 1 m/s.
- **A bank behind the ring cannot be thrown hard from the guest spot:** a fast, flat shot meets the ring from below on its
  way to the glass. A hard bank strikes the glass left of the ring (x −0.137…−0.05 su, the frame's lip and the ring's
  edge bounding it).

## What was built

### The physics (`ballPhysics.ts`)

- `surfaceImpulse(v, w, n, e, μ, e_t)`: the floor's impulse on any normal (normal reversed with e; the contact point's
  tangential slip reversed by e_t when it grips, else μ × the normal impulse; the spin takes the friction's moment).
  Unit-tested: angular momentum about the contact point conserved for 200 random normals; equal to `floorImpulse` for +y.
  `floorImpulse` itself is untouched (the host and accept tracks are bit-identical).
- `SURFACES` (above), `Collider`s: the laminate's plane `z = FACE_Z` inside its opening (`BOARD.opening`, measured from
  the GLB: x ± 0.943 su about the board's centre, y 3.111…4.548 su; the frame's lip stands 3.1 cm proud around it) and
  the ring's torus (`RIM_CENTER`, tube radius 0.024 su).
- `flyUntil`: the exact parabola, strikes found by scanning the gap every 0.25 ms and bisecting to 1e-12 s.
- `surfaceContact`: the strike drawn like a floor contact over 20 ms: the undeformed centre slides along the tangent
  plane (gravity's tangential part acting), the drawn centre sits in by the compression along the normal (the touching
  side stays on the surface: unit-tested on the face), the spin hands over. Recorded as a **`Hit`** (`surface`, `at`,
  `point`, `normal`, `contact`, `speed`, `rebound`, `squash`, `impulse`) in **`track.hits`**, apart from the floor
  `contacts`, so the carry-on to the next floor contact and the rolling stop keep working.
- **Squash along the normal:** `SportsFrame.squashAxis` (up on the floor, a hit's normal on the glass or the ring);
  `ball_secondary` turns its +y onto it and `ball_mesh` carries the spin relative to it. Probe: the glass's squash is
  **1.5 % (2.8 mm), invisible** at stage size; the ring's first is 3.0 % (5.4 mm, ≈ 2 px at 1080). The axis costs
  nothing and keeps the drawn side on the surface, so it stays.

### The bank (`sequences.ts`)

- **Its own gather** (`BANK_TIMING`): the hand rolls the ball back 16 cm (the cubic pull-back 8.4 cm and a `windUp`
  bump of 9 cm, release and launch unchanged by it) and forward over 0.525 s, lifts it 11 cm (`BANK_LIFT` 0.3 su) from
  0.375 s and fires it at **0.525 s** (the shots' 0.2 s cannot strike hard, above). The launch is closed form (the glass
  at `BANK_POINT` on the beat): **5.25 m/s**, 2.0 rev/s backspin.
- **`BANK_POINT` (−0.08, 4.16, FACE_Z + R)**: on the grey laminate left of the target square, 20 cm screen-left of the
  rim's axis (on screen the ball overlaps the frame's left edge a little; it clears the lip by 1.6 cm in depth),
  **27.8 cm above the rim's top**, 14 cm under the frame's top lip. Chosen from the sweep (`scripts/_scratch/bank.ts`,
  `pick.ts`) as the strike that rises into the glass, is kicked down onto the ring's top, rattles three times and falls
  off front-left with no cost to the frame; the tests lock every one of those properties.
- **The strike** (0.950 s): arriving 1.45 m/s, rising 0.97 m/s, **0.94 m/s square on** (v1.5's shared gather: 0.53);
  out at 0.74 m/s: forward 0.67 m/s and **kicked down** (vertical +0.97 → −0.12 m/s), its backspin turned (the strike's
  impulse 0.55 N·s).
- **The rattle**: three strikes on the ring's left-front top (normals within 17° of up): 1.158 s at **1.96 m/s** (out
  1.17), 1.418 s at 1.17 (out 0.70), 1.586 s at 0.67 (out 0.40); hops of 8, 3 and 1 cm along the ring, then it rolls off
  its outer side. Never inside the ring below rim height, never into the tube beyond its compression, never on the
  bracket (tested at 1 ms).
- **The carom and the trap**: first floor contact **2.135 s** at (−0.26, 1.10): 4.89 m/s down, 60.7 cm in front of the
  board's back plane, wide of the base. A real carom would roll on for metres (above), so **the player traps that
  bounce** (`trapTo`, the change of mind's hand through a floor contact): it keeps its own height (e 0.77: a 72 cm hop) and
  its run turns from 0.49 m/s towards the camera to 0.15 m/s back-left, closed form so the dying bounces (10 contacts) and
  the roll end exactly on `MISS_REST`.
- **`REST.missed` = `MISS_REST` (−1.6, 0.25, 0.3)**: front-left and wide, **1.31 diameters** from the guest spot on
  screen (the brief's ≈ (−1.3, 0.35) is 0.80, under the 1.2 the legibility test requires), 4.79 from the accepted rest,
  6.67 from host-ready. `SPORTS_BOUNDS` grows to reach it and the wind-up (x −1.6 → −1.9, z 1.4 → 1.6).
- **`REST_AT.decline` 6.60 s** (v1.5: 5.10): the bounces from the ring's height end at 5.33 s, then a 9.5 cm roll (1.25 s). The
  loop idles **6.8 s** after the tap at both sizes (draw calls counted, `scripts/_scratch/idle.ts`); `sports.spec`'s 15 s
  holds.
- Exports: `BANK_POINT`, `BANK_HIT`, `HITS`, `RELEASES`, `MISS_REST`, `FACE_Z`, `HOOP_COLLIDERS`, `SCREEN_RIGHT`; the
  airball's `MISS_LAND`/`MISS_POINT`/`MISS_OFFSET` are gone.

### The hoop's answer (`index.ts`)

- `hitKick(hit)`: the part takes −m·Δv (0.298 kg, metres); the glass turns the board about `BOARD_PIVOT`; a strike on the
  ring turns the ring about `RIM_HINGE`, and its hinge pin hands the impulse to the board about `BOARD_PIVOT` (the ring's
  mass neglected); each over its `HOOP_SPRINGS` inertia. Kicks: the glass **−0.264 rad/s** on the board (its top goes
  back); the ring **4.82, 3.25, 2.06 rad/s** on the rim (+0.05, 0.14, 0.10 on the board).
- They fire from `sample`/`simulate` the way the net's clock runs: a hit clock along the program on screen fires every
  strike it passes, once; a new run restarts it. The springs are stepped by the net channel. A change of mind's copied
  bank and rattle carry their strikes on the change's own clock; a cut inside a strike's window keeps its squash axis.
- **Interruption:** the scene keeps the springs' motion over the director's settle and `refresh()` restores it (since the
  net rebuild the channel also carries it whenever the springs move); reduced motion never refreshes. Unit-tested on a
  rig without the GLB; strip `change-decline-to-accept-in-the-rattle-1.30s-closeup.jpg`: no pop.
- Measured (springs at 1/960 s, the net owner's ζ 0.4 rim): the first clang **bottoms the rim on its 3° stop** (its
  undamped first swing would be 3.9°): the ring's front drops **2.1 cm**, visible in the close-up strip; the board peaks
  at **0.14°** (its top moves ≈ 1 mm: invisible); everything is settled **2.68 s** after the tap, before the ball rests.
  The strikes also stir the resting net (the net owner's `active()`), which settles. With the rim's ζ raised from 0.15 to
  0.4 nothing needed recalibrating: the kicks are derived, not sized.

### The frame (`index.ts`, core)

- **Hero = board + rim + net + ball**: `silhouettePoints(root, o => SPORTS_HERO_EXCLUDE.test(o.name))` with
  `/^hoop_(stand|pole|hardware)$/` (exactly the stand's three meshes in the GLB, tested). The base's footprint is gone
  from `sportsFramePoints`; `SPORTS_BOUNDS` still holds it for the key light.
- `SceneInstance.heroFill` → `Stage.setContent(…, closeUp, heroFill)` → `solveHeroFits(…, heroFill ?? HERO_FILL, …)`.
- **`SPORTS_HERO_FILL = { height: 0.92, width: 0.76 }`**, measured with the solver on the GLB's hero and in the browser
  (`controller.framing`):

| Aspect | Hero height / width | Binding | pathLimited | Largest that keeps every path inside |
| --- | --- | --- | --- | --- |
| 3:4 | 0.903 / **0.760** | width (the paths' width: the host spot right, the declined rest left) | false | height 0.913 equivalent |
| 1:1 (and every fullscreen frame square: laptop 528 px, phone 343 px) | **0.920** / 0.581 | height (the made rest, nearest the camera, sets the bottom) | false | 0.930 |
| 3:2 | **0.920** / 0.387 | height | false | 0.930 |

- **Bigger:** the camera comes in from 26.38 to 17.55 scene units: **everything 1.50× larger** (1.48× at 3:4). The ball is
  **8.9 % of the frame height** (v1.5–v1.6: 5.9 %), ≈ 64 px on a 720 px poster.
- **Why "cutting the bottom of the board" became this:** at the shared 15° elevation the pole and the base project
  *above* the ball's floor line on screen (the base sits behind the board, the floor rises towards the horizon), so no
  crop at the bottom can hide the stand while the ball rests in frame. Dropping the stand from the hero and the frame
  lets the camera come in until the board and the ball fill the frame; the stand is then cropped by the right edge at 3:4
  (the base) and is whole at 1:1 and 3:2 (it lies inside the hero's span).
- **Tight:** at the largest fill the board's top sits 2.5 % under the frame's top and the paths 2 % inside every edge
  (by the rule); at 3:4 the declined ball rests on that 2 % line at the left edge. A fill of ≈ 0.85 would give air at the cost of
  8 % of the gain (a one-number change if Surya prefers it).

## Tests

- `pnpm typecheck` clean. Unit, one file per call: `tests/sports.test.ts` **64 passed** (new: the impulse on any normal,
  the sourced restitutions, Cross's spin on the glass, the drawn strike on the face, the bank and the rattle and the
  never-in, the board as a solid with its lip, the bank's legibility, the hero and fill at 3:4/1:1/3:2 with pathLimited
  false and the ball ≥ 8.5 %, the GLB's face opening and the stand's names, the change of mind before the bank and in
  the rattle, the kicks by hand, the shudder under the stops and settled before the ball rests, the scene's kicks and
  its carry over an interruption); `tests/stage-framing.test.ts` **14** (new: the Sports fill through `Stage.setContent`,
  the phone's frame square, 0.6 without it); `tests/sportsSprings.test.ts` 4; `tests/posters.test.ts` 1. Whole suite once
  (`pnpm vitest run --testTimeout=1800000`): **513 passed in 34 files**.
- Browser, fresh 5702 server, one spec per call: sports 6, framing 9 (the Sports fill 0.92/0.76), posters 5, fullscreen
  14, idle 4, collection 3, gallery 4, a11y 8, scene-depth 5, resilience 14, bloom 3, party 9, business 14, bin 8,
  birthday 7, dinner 8: **121 passed**.

## Evidence (`evidence/v1.7/sports-decline/`)

- `strips/decline-laptop-1280x720-overview-every6.jpg`, `strips/decline-phone-390x844-overview-every6.jpg` (the real
  stage at 1280 × 720 @2 and 390 × 844 @3, 16 ms frames through the controller, `scripts/sports-strips.ts STRIP_VIEW`),
  `strips/decline-laptop-bank-and-rattle-60fps.jpg`, `strips/decline-hits-1x1-closeup-60fps.jpg` (1:1, 1080 px: the
  strike, the rim bottoming out, the rattle), `strips/change-decline-to-accept-in-the-rattle-1.30s-closeup.jpg`.
- `motion/decline-laptop-1280x720.mp4`, `motion/decline-phone-390x844.mp4` (7.5 s, tails included).
- `stills/poses-{3x4,1x1,3x2}.jpg` (every pose at the new frame, an embed stage), `stills/declined-{laptop-1280x720,
  phone-390x844}.png`, `stills/frame-before-after-1x1.jpg` (v1.6 → v1.7 posters).
- `pacing-decline.txt` with `pace-sports.ts` (the judges' v1.6 `pace-scene.ts`, SEQ=decline): **p95 16.7–16.8 ms, max
  16.8 ms, no frame over 20 ms** at both sizes, three runs each.
- Posters (both presets, four poses), the collection thumbnail and `backdrop.webp` recaptured (`CAPTURE_NO_CLIPS=1 pnpm
  capture sports`, `pnpm capture backdrops`; only Sports' backdrop kept); `posters.spec` green (max 12/255).

## Where #43 could not be built as written (for Surya and integration)

1. **The decline's wind-up is 0.525 s, not the shared 0.2 s gather** (the beats are unchanged: the glass on 0.95 s,
   1.6 s). Kinematics: from the guest spot the shared gather meets the glass at 0.53 m/s whatever the arc. The wind-up
   reads from the tap (16 cm back and forward), but the ball leaves the floor 0.33 s later than the accept's.
2. **"Hard" is 0.94 m/s square on** (1.45 m/s total): the hardest strike from there that still comes down on the ring
   rather than meeting it from below on the way up. The drama is in the hang and rattle on the ring and the rim's slam.
3. **The player traps the carom's first bounce.** No real carom off a rim comes to rest in frame; the trap is the change
   of mind's hand acting through a floor contact (height kept, the run turned). Its spin jump at that bounce is the one
   unphysical frame (the ball arrives with 0.49 m/s of run and its own spin, leaves rolling at 0.15 m/s).
4. **First floor contact at 2.13 s, not ≤ 1.6 s:** the rattle holds the ball on the ring for 0.43 s and it falls 1.2 m.
5. **`REST.missed` (−1.6, 0.3), not (−1.3, 0.35)** (legibility), and **`REST_AT.decline` 6.6 s** (a 5 s tail).
6. **The board's shudder is invisible** (0.14°, ≈ 1 mm at its top): `HOOP_SPRINGS.board` (15 Hz, 2500 N·m/rad, the net
   owner's) is a stiff pole. A visible wobble needs a softer board mode there; the kicks already carry the right impulse.
7. The bank point is near the frame's left lip on screen (20 cm screen-left of the axis, not "a little"): a hard shot from
   the guest spot can only reach the glass left of the ring.

## Known gaps

- The drawn ball sits on the ring at its rest pose while the ring dips 3° under it (≤ 2 px for a frame at 1080 px; not
  composited onto the recoil).
- The rattle's hops (8, 3, 1 cm) read as the ball wobbling on the rim at laptop size more than as bounces.
- The frame is as tight as the rule allows (above).
- `scripts/capture.ts`: the clips were not re-recorded (`CAPTURE_NO_CLIPS`); `evidence/…/motion/` has the decline at
  both sizes instead.
