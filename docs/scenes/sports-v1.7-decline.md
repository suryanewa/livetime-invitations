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

## Polish round (2026-10-06)

The judge (`docs/qualification.md` v1.7, the decline row): ≈ 7 against v1.6's 5, "a clear win on both asks", but
**the bank reads soft** (the rebound goes almost wholly towards the camera, so on screen the ball "floats up and dies
on the glass"), **"cutting the bottom of the board" is not literally delivered** (the pole and the base whole and
prominent, the black base the heaviest mass in the frame), and the fill leaves 2.6 % headroom. The orchestrator's
decision: the fill at {0.85, 0.70}; a visible stand sway; a push-in during the decline. Branch `v1.7/sports-polish`
from `v1.7/integration` dea242d, merged with the Dinner polish (43105ab) before the camera work and with the poster
layer (cea22a6) before the captures. The net's half (the tails) is in `docs/scenes/sports-v1.7-net.md`.

### 1. The fill: {0.92, 0.76} → {0.85, 0.70}

`SPORTS_HERO_FILL` only. Measured on the real stage (`controller.framing()`, the GLB's silhouettes):

| | #43 at {0.92, 0.76} (the judge's numbers) | {0.85, 0.70} |
| --- | --- | --- |
| Board's top from the frame's top, 1:1 and 3:2 | 2.6 % | **6.2 %** (3:4: 7.1 %) |
| Lowest ball from the frame's bottom | 2.2 % | **6.2 %** (3:4: 7.1 %) |
| Declined ball from the left edge at 3:4 | 2.4 % | **2.9 %** (the path samples; the judge's measure gave 3.3 %) |
| The base at 3:4 | a tangent crop at its wheel | **whole**, 6.6 % from the right edge (the solver's hero) |
| Binding | height at 1:1 and 3:2, width at 3:4 | the same: height 0.850, width 0.700 (its height 0.833) |
| Camera distance at 1:1 (world units) | 31.6 | 33.9: everything **0.93×** #43's, **1.40×** v1.6's |
| The ball's height on screen at 1:1 (the solver) | 8.9 % | **8.2 %** (v1.6 5.9 %) |

Tests on the measured numbers: `tests/sports.test.ts` (0.85 / 0.70, the paths ≥ 5.5 % inside the top and bottom at
every aspect, the ball 8–8.5 %), `tests/stage-framing.test.ts` (0.85 / 0.70, the phone's frame square, the distance
1.38–1.45× the shared rule's), `tests/browser/framing.spec.ts` (the fill on the real silhouettes). The 8 posters, the
thumbnail and the four backdrops were recaptured (below).

### 2. The hardness: the stand sways

A portable mini hoop sways on its pole; the board's own shudder (`HOOP_SPRINGS.board`, 15 Hz, 0.14°, ≈ 1 mm) was
invisible. Added to `HoopSprings` (`models/sportsNet.ts`) a third mode, **`stand`**: the whole hoop above the base (the
pole, its clamp collar, the arms and plates, the board, the rim and the net) pitching about the pole's foot in the
base's socket (`STAND_PIVOT` = `POLE.foot`, 13 cm up, 34 cm behind the hoop's origin).

| Quantity | Value | Source |
| --- | --- | --- |
| Inertia about the foot | **11.3 kg·m²**: the board 3 kg at its centre, the rim 0.9 kg at the ring's centre, the arms, sleeve and back plate 1.5 kg half-way from the pole's head to the board's back, the pole 2.0 kg (1.4 kg/m of 1¾–2" tube, 1.43 m, a rod about its end) | the masses of `HOOP_SPRINGS` (the net owner's), the contract's geometry |
| Frequency | **3 Hz** (k = 4014 N·m/rad) | The cantilever with a tip mass, f = (1/2π)·√(3EI / ((M + 0.24 m)·L³)) (Blevins, *Formulas for Natural Frequency and Mode Shape*, 1979, table 8-1; engineersedge.com's "cantilever beam with mass at end" calculator), gives 8–9 Hz for this tube (2" × 1.2 mm steel, EI ≈ 1.15 × 10⁴ N·m², L 1.43 m, M ≈ 5.5 kg) clamped rigidly. A portable system is not clamped: the pole sits in a socket in a blow-moulded, sand- or water-filled base that rocks on the floor (Spalding's portable-system owner's manual: the filled base is the system's only anchor) through a telescoping joint held by a pin and a clamp collar; retailers' guidance: portable systems "shake and rattle quite a bit compared to in-ground" ones. Those compliances in series bring the mode down ≈ 3×: the middle of the judge's 2–4 Hz |
| Damping | **ζ 0.1** | low (steel, the base's sand and plastic); chosen so the sway falls under 1 mm at the board's top 1.3 s after the glass |
| Guard | `RECOIL_LIMIT.standDeg` **0.75°** | never reached (the decline peaks at 0.27°); past it a weighted mini base would rock off its edge, which is not modelled |
| Drive | the same derived impulses (`hitKick` → `kick(rim, board, stand)`): the strike's moment about `STAND_PIVOT` over the stand's inertia, from the glass's contact or (a ring strike) the hinge where it enters the board | the glass **−0.071 rad/s** (the top back), the clangs **+0.058, +0.024, +0.012** (forward). Not the net's pull: a swish's 0.66 N·s over 0.15 s would sway it ≈ 2 mm, and the accept is left as judged |

- **The transform.** `recoilPoint(p, board, rim, out, stand)` carries the sway after the board's pitch, `standPoint`
  rotates about the foot; `hoopRecoil.set(board, rim, stand)` moves the board, the rim and the net and the stand's
  swaying parts (`standSwayParts`): the pole whole, and of `hoop_stand` (the base and the collar) and `hoop_hardware`
  (the wheels' hubs, the plates and bolts) the triangles above **30 cm** (`STAND_SWAY_CUT`, between the base's ≤ 19 cm
  and the collar's 60–80 cm), split at load into a `<name>_sway` sibling sharing the geometry's attributes (only the
  index is new; `SPORTS_HERO_EXCLUDE` covers it). The base stays on the floor.
- **The net rides it** in the same transform: the net is simulated in the base's frame and its loops are pinned to
  the swaying rim (`NetSim` pins, `NetSkin.update` inverting the full transform), so the knots follow through the
  cords and lag as hanging cord does (the sway's inertia on the net at no extra cost, nothing added to the
  integrator). A glass strike jolts the loops back at ≈ 8.5 cm/s; the hanging net (1.15 Hz) swings ≈ 1.2 cm relative
  to the hoop (the board's shudder alone 0.3 cm), then hangs still (unit test). `HoopSprings.active()` counts the
  sway by its energy (its peak rate, which only falls) over 0.025 rad/s, so a net that settles on a dying sway is
  never woken by it again (tested: no flapping).
- **Carried and exact.** `save()` appends the sway and its rate while it moves (a hoop that does not sway saves the
  same five-tuple as before, so the existing tests hold unchanged); `restore()` takes either; a change of mind carries
  it over the director's settle (tested at the scene). 0 at rest: the rest pose and the posters are unchanged.

**Measured on the stage** (`evidence/v1.7/sports-polish/tools/sway-stage.ts`, 16 ms frames through the real controller,
the board's top centre against its rest, with the push-in below applied; `measurements/sway-stage-*.csv`):

| | Laptop 1280 × 720 | Phone 390 × 844 |
| --- | --- | --- |
| After the glass alone (1.04 s, 0.18°, 6.2 mm at the board's top) | **1.38 CSS px** | 1.0 px |
| Peak (1.23 s, after the first clang: 0.27°, 7.6 mm) | **1.85 px** | 1.36 px |
| Last frame over 0.5 px | 1.74 s (0.79 s after the glass) | 1.71 s |
| Last frame over 0.25 px | 1.92 s | 1.89 s |
| Frequency | 3 Hz (2.98 Hz damped) | |
| Under 1 mm at the board's top | 1.3 s after the glass | |
| Springs settled (< 2 µrad) | ≈ 5.7 s, before the ball rests (6.6 s); the loop idles 6.59 s after the tap (was 6.63) | |

It reads as a shiver on the strike (the board kicked back, three quick swings, the clangs re-striking it) and is gone
within a second; the pole visibly flexes against the static base at the strips' 16 ms. The board starts moving one
frame after the contact frame (the kick fires when the director's sample passes the strike, as the rim's and the
board's always have). **The ball against the swaying ring:** at the three clangs the sway stands at 0.08°, −0.17°,
0.14°, moving the ring's struck point ≤ 3.9 mm, ≤ 2.2 mm of it vertical: ≤ 0.9 CSS px at laptop (≤ 0.7 px on the
phone) of gap or overlap for the 20 ms contact, on top of the known rim-dip gap (below).

**The impact accent: not adopted.** One or two frames of a stronger squash on the glass were tried
(`strips/impact-accent-1x1-0.944-0.976-physics-vs-x2.2-not-adopted.jpg`, 1:1 with the push-in): the glass's normal
lies near the line of sight (the shared view is 20° and 15° off it), so the squash compresses the ball *towards the
camera*; even at 2.2× (3.5 %) the silhouette only widens ≈ 2 % for one frame. It does not read as an impact and is
not physical, so the drawn strike stays the physics (1.6 %).

Tests: `tests/sportsSprings.test.ts` (+5: 3 Hz about the foot, low damping, the inertia's range; Δω/ω per impulse and
the damped frequency from the zero crossings, under 1 mm within 1.5 s, settled within 5 s; the guard both ways and a
part on it taking no velocity; save/restore exact through a settle; no flapping of `active()`);
`tests/sports.test.ts` (the kicks' moments about the foot by hand; the decline sways the board's top 5–10 mm, gone
1.5 s after the glass, settled before the ball rests; the recoil carrying every part about the foot and 0 restoring
exactly; `standSwayParts` cutting a mesh and sharing its attributes; the scene carrying the sway over an
interruption; the net riding the sway, its loops on the rim within 0.5 mm, the bottom lagging 0.5–2 cm, settling).

### 3. "Cutting the bottom of the board": the decline pushes in

The rest frame cannot hide the stand while the ball rests on the near floor (above), but the decline's dramatic moment
is airborne. So the camera leans in on it (`src/scenes/sports/focus.ts`):

- **The focus fit** (`SceneInstance.closeUp`, kind `'focus'`): the hero rule along the **shared direction** (azimuth
  20°, elevation 15°, the 18° lens) at the **rest fit's own aim**, the hoop (the board's corners, the ring, the net's
  envelope with its swing: `hoopFramePoints`, the frame points' own) at **`SPORTS_FOCUS_FILL` {0.8, 0.8}**, the ball's
  airborne path from 0.78 s (the channel four fifths in) to the end of the rattle held PATH_CLEARANCE inside. Solved
  once per content and aspect beside the rest fit (no refit during a sequence: tested).
- **The channel** (`frameClose`, `focusIn`): a pure function of the decline's time, its tail included: 0 to
  **0.40 s** (the hand lifting the ball; it leaves at 0.525 s), eased to **1 at 0.93 s** (before the glass at 0.95 s),
  held through the rattle (its last strike 1.586 s + 20 ms) to **1.61 s**, eased back to **0 at 2.10 s** (before the
  first floor contact at 2.135 s). The ease both ways is CSS's ease-in-out, cubic-bezier(0.42, 0, 0.58, 1): its peak
  rate only 1.72× the mean (Dinner's close-up's 2.06×, the decline pull's 2.18×), ≈ 3 % of image scale a frame at
  its fastest. 0 at every pose: the posters, reduced motion (the camera cuts with the pose) and the declined still are
  unchanged.
- **The move** is a dolly along the shared direction between the rest view and the focus fit (`pulledView`, #39's:
  slide, never zoom; the camera looks along the shared direction at every k, tested), not the close-up's boom.
- **A change of mind** (decline → accept at any τ) brings it home C1 on Dinner's homecoming (`planCloseHome` /
  `closeHome`, from where the cut finds it, at the speed it had, ≤ 0.7 s, 0.56 s from 1 at rest) while the ball
  carries on through its copied rattle: tested at 0.6–2.0 s for continuity of place and speed and the ball in frame;
  strip `strips/change-decline-to-accept-at-1.25s-laptop-every3.jpg`. Accept → decline, and a decline from the
  accepted pose (a saved accept: the ball rolls from the accepted rest, no bank), never push in: their decline is a
  change track (tested at the scene and in the browser).

**What it shows** (the real stage, `controller.framing()`, `tools/focus-stage.ts`, `measurements/focus-stage-*.csv`):

| | 1:1, 3:2 (and every fullscreen frame square) | 3:4 (a per-aspect fit: `framing(0.75)`; a 3:4 mount now frames the square, below) |
| --- | --- | --- |
| Zoom (rest distance / focus distance) | **1.68×** (33.86 → 20.20 world units) | 1.60× (the width binds at 0.8) |
| The hoop's height in the frame | 0.80 | 0.745 |
| The ball at the strike | **14.4 % of the frame's height**: 76 CSS px of the laptop's 528 px frame square (45 px at rest), 56 px on the phone | |
| Where the frame's bottom crosses the pole | ≈ 45 cm above the floor, under the clamp collar | ≥ 38 cm |
| The base's highest point (the socket's boss, 17.2 cm, the GLB's vertices) | **5.2 % of the frame below** the bottom edge | 2.0 % below |
| Fullscreen (the view extends past the frame square) | laptop: the base's top 731 px against the canvas's 720 (11 px out); phone: 584 against the dock's top at 574 (10 px under it) | |
| The base out of the visible frame | laptop 0.88–1.68 s, phone 0.86–1.68 s: from just before the glass to after the rattle | |
| The ball inside the frame | on every 1/240 s frame of the decline at 3:4, 1:1 and 3:2, ≥ PATH_CLEARANCE (unit test); on the stage ≥ 69 px inside the laptop frame square's left edge | |

At 0.7 (the first try) the base's boss stayed 4 px inside the laptop's view; 0.76 left a 1 px sliver; 0.8 clears it at
every size. On the 16 ms strips (`strips/after-*`, `strips/after-push-in-laptop-0.4-1.0s-every16ms.jpg`,
`after-pull-back-laptop-1.55-2.2s-every16ms.jpg`, `motion/decline-*.mp4`) the camera leans in as the hand lifts the
ball, the hoop growing and sliding to the centre as the ball rises; at the strike the glass and the rim fill the frame,
the pole runs out of the bottom and the base is gone (`stills/focus-1x1-at-the-strike-0.96s.png`); it holds through the
rattle (the stand's shiver visible against the frame) and pulls back calmly as the ball drops off the ring, the
base sliding back in under it before the bounce. It reads as the camera leaning in on the shot, not a zoom-punch.

**The mechanism, generalised from Dinner's close-up** (Dinner's behaviour byte-identical; its tests unchanged and
green: dinner 35, pull 18, framing 11, stage-framing's Dinner cases, the browser dinner and framing specs):
- `CloseUp` (`src/render/camera.ts`) gains `kind` ('close-up' | 'focus'), `fill` (the hero rule's, instead of
  `widthFill`), `aim` ('subject' | 'stage') and `paths`; `solveCloseFit` takes the paths (Dinner's `[[]]` and fill
  unchanged); `pulledView` takes any two `{distance, offset}`.
- `Stage` (`src/render/stage.ts`): a focus is aimed at the rest fit's aim and placed as a dolly from the (pulled) view
  (`pulledView` → `placeHeroView`); Dinner's boom (`closeUpView`) is the other branch, unchanged; `closeKind` says
  which; the focus's paths go through `framingHull` (exact along the shared direction).
- `controller.framing()` reports a focus as **`focus`** (the live channel) and **`focusFit`** (its fit), a close-up as
  `close` / `closeUp` as before (Sports' `close` is 0, Dinner's `focus` 0).
- The homecoming moved to `src/render/cameraChannel.ts` (`planCloseHome`, `closeHome`, `PULL_TOP_SPEED`,
  `rewindCurve`), re-exported unchanged by `src/scenes/dinner/pull.ts`.

Tests: `tests/sports.test.ts` (+5: the channel's timing against the strikes and the floor, C1, the ease's peak; the
focus fit's zoom, the pole's cut and the base out of frame at 3:4, 1:1, 3:2, the ball ≥ 14 % at the strike; the ball
in frame at every 1/240 s frame; the scene: 0 at every pose, `focusIn` along the decline and its tail, nothing for the
accept or a decline from the accepted pose; changes of mind at seven times: no jump in place or speed, home within
0.7 s, the ball in frame), `tests/stage-framing.test.ts` (+1: the dolly along the shared direction, the focus fit at 1,
exactly home at 0, no refit), `tests/browser/framing.spec.ts` (+1: the focus fit at every aspect on the real
silhouettes; the live channel up, held, home through a real decline; poses, reduced motion and a decline from the
accept stay at 0; no fit solved).

### 4. Not done: the trap absorbing height

The 6.6 s tail could be shortened by 1–1.5 s with the trap keeping less height (≈ 0.5 instead of the floor's 0.77).
Left as built: the judge accepted the tail as natural and found the trap invisible, and a trapped bounce visibly lower
than the ones around it would make the one guided bounce read as guided, the risk the brief named.

### Pacing, captures, tests

- **Pacing** (`pacing-decline.txt`, `pace-sports.ts` from guest-ready with a reload per run, three declines at each
  size, the push-in's frames 24–130): p50 16.70, **p95 16.70–16.80 ms, max 16.8 ms, no frame over 20 ms** at laptop
  and phone (#43: the same).
- **Captures** on a fresh 5705 server after merging the poster layer: `CAPTURE_NO_CLIPS=1 pnpm capture sports` (the 8
  posters, the thumbnail) and `pnpm capture backdrops` (Sports' four, with the scene; Birthday's re-render reverted);
  `posters.spec` green (max 16/255, 0.00 % over 24/255). The decline clip was recorded with the strips tool through
  the real controller (`motion/decline-{laptop-1280x720,phone-390x844,1x1-540}.mp4`, 2.6 s).
- **Tests** (one file per call): typecheck clean; `tests/sports.test.ts` **76** (was 64), `tests/sportsSprings.test.ts`
  **9** (4), `tests/stage-framing.test.ts` **15**, `tests/framing.test.ts` 11, `tests/pull.test.ts` 18,
  `tests/dinner.test.ts` 35, `tests/posters.test.ts` 1; the whole suite once (`pnpm vitest run --testTimeout=1800000`):
  **535 passed in 34 files**. Browser on a fresh 5705 server, one spec per call: sports 6, framing 10, posters 6,
  fullscreen 15, dinner 10, scene-depth 5: **52 passed**. (`idle.spec`'s Party "plays on" case counts 30 frames a
  second where it wants 40 on this machine today, on this branch and on `v1.7/integration` alike: not this round's.)

### Evidence (`evidence/v1.7/sports-polish/`)

- `strips/before-decline-{laptop-1280x720,phone-390x844}-0.4-2.4s-every4.jpg` (the integration build) and
  `strips/after-decline-*-0.4-2.4s-every4.jpg`; `strips/after-push-in-laptop-0.4-1.0s-every16ms.jpg`,
  `strips/after-pull-back-laptop-1.55-2.2s-every16ms.jpg`; `strips/change-decline-to-accept-at-1.25s-laptop-every3.jpg`;
  `strips/impact-accent-1x1-0.944-0.976-physics-vs-x2.2-not-adopted.jpg`.
- `stills/poses-{3x4,1x1,3x2}.jpg` (a square-layout mount of that aspect, after the poster layer: every pose and the
  decline at the strike),
  `stills/poses-{laptop-1280x720,phone-390x844}.jpg`, `stills/focus-1x1-at-the-strike-0.96s.png`.
- `motion/decline-*.mp4`; `pacing-decline.txt`; `measurements/` (the sway and the focus per 16 ms frame on the stage,
  the loop's idle, the tails); `tools/` (`sway-stage.ts`, `focus-stage.ts`, `framing-probe.ts`, `idle.ts`,
  `tail-probe.ts`).

### Known gaps after the polish

- The kicks fire on the frame the director's sample passes a strike, so the board and the stand answer one frame
  after the contact frame (as before for the rim and the board).
- The sway is a rigid pitch about the pole's foot (no bending shape, no twist from the bank's 20 cm offset).
- The ball is drawn on its track, so it sits ≤ 2.2 mm (≤ 0.9 px at laptop) off the swaying ring during a clang, on
  top of the rim-dip gap.
- **A portrait square-layout mount (3:4).** The poster layer (cea22a6, merged before the captures) frames a
  square-layout mount of another aspect like fullscreen: the frame square, the rest of the mount extending the same
  view. The focus is fitted on that square, so in a 3:4 mount, which shows a sixth of the square more below it, the
  base's top is back in the bottom **54 of 720 px (7.5 %)** at the strike (`stills/poses-3x4.jpg`, the last cell);
  landscape (3:2) and 1:1 mounts and the showcase's laptop and phone frames hide it. This follows Surya's pending
  decision on non-square mounts (RESUME, v1.7 decision 5): if the square framing stays, fit the focus to the mount's
  free area in the square layout (a window fit in `Stage.fit`, the dolly unchanged); if per-aspect fits come back,
  the per-aspect focus at 3:4 already hides the base (2 % of the frame below its bottom: the table above).
- The focus is fitted on the frame square; a fullscreen layout that shows much more below the square than the laptop
  (16 px) or the phone (under the dock) would show the base's top again.
