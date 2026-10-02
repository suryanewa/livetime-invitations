# Sports v1.5: a real hoop, real bounces, a real net

Surya's three Sports edits from the perfection pass (`docs/perfection-pass-brief.md`):

- **#7** "The basketball hoop looks far too childish because of its weird proportions / height."
- **#8** "Better bounce physics for the ball."
- **#9** "Better net physics as the ball passes through the hoop."

The beats are unchanged: host 1.2 s, accept 1.7 s with net contact at 0.95 s, decline 1.6 s.

Files changed: `models/sportsContract.ts` (proportions, stand, pivots, the net's hang), `models/sportsPremium.ts` (the
stand), `models/sportsNet.ts` (new: the net's lattice, simulation, skinning and hoop springs), `models/sports.ts` (rig),
`src/scenes/sports/ballPhysics.ts` (new: the ball's physics), `src/scenes/sports/sequences.ts` (choreography on
physics tracks), `src/scenes/sports/change.ts` (new, polish round: a change of mind continues the ball's physics),
`src/scenes/sports/index.ts` (tails, live net, framing points, interruption), `scripts/masters/recipes/sports.ts` (the
stand's maps, the cream preset), `scripts/masters/{types,compose}.ts` (a recipe `finish` hook), the tests, and
`assets/scenes/sports/sports.glb`.

The **polish round** (after the judges' pass; section at the end) changed the bounce constants, the interruption, the
net's constants and hang, the stand's materials and the cream ball; the tables below give the final values.

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
back. The stand has its own mapped materials (polish round; `finishStand` in the recipe, deterministic 512² WebP like the
bin's): the base a moulded-polypropylene micro-texture (EDM-spark normal, roughness 0.55 ± 0.04 mottle), the pole and arms
a black powder-coat grain (roughness 0.36 ± 0.03). The base contact blob is now rectangular.

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
| Normal restitution e | **0.77** | FIBA Official Basketball Rules 2026, Equipment §3: dropped from ≈ 1,800 mm it rebounds to 1,035–1,085 mm, both to the underside of the ball (e 0.758–0.776); brief 0.76–0.84. Test: a 1.8 m drop rebounds to 106.7 cm. *(Round 1 used 0.82, from the older rule's 1.2–1.4 m read as underside; that rule measures to the top of the ball.)* |
| Sliding friction μ | 0.6 | pebbled rubber on a hard floor |
| Tangential restitution e_t | 0.15 | Cross 2005: grip near normal incidence, e_x 0–0.2 |
| Moment of inertia | I = ⅔ m R² | hollow shell |
| Rolling resistance c_rr | 0.02 → 0.33 su/s² | rubber ball on a painted studio floor (hardwood ≈ 0.01) |
| Squash | 10 % of the diameter at 5.94 m/s, linear in impact speed | brief; a linear spring with that compression at that speed contacts for 9.5 ms |
| Drawn contact | **20 ms** (real ≈ 10 ms; round 1: 30 ms) | 1.2 frames at 60 fps, so a frame always catches it; the bottom stays exactly on the floor and the centre dips by the compression; no stretch (not rubbery) |
| Bounce stop | rebound < **1.23 su/s (a 1 cm hop)** (round 1: 1 mm) | then slide → grip → roll to a stop: no pogo of sub-centimetre hops |
| Air drag, Magnus | omitted (≈ 7 % and 2 % of g at the shot's top speed) | so each flight is an exact parabola |

Contacts are impulses after Cross: the contact point's tangential velocity is reversed by e_t when the ball grips, else
μ limits the impulse; angular momentum about the contact point is conserved (unit-tested). So a backspinning ball checks
up, a topspinning one runs on, and a ball without spin leaves nearly rolling.

| Sequence | Launch | Contacts | First impact → rebound | Peak squash | Comes to rest |
| --- | --- | --- | --- | --- | --- |
| Accept | solved to pass the rim centre at 0.95 s (apex 0.71 su = 26 cm above the rim, 72° entry), 2.5 rev/s backspin | 9 | 4.22 m/s → 54 cm hop; then drifts forward 7.6 cm/s | 7.1 % | 4.70 s (bounces end 4.05 s), 0.6 su in front of the landing, clear of the base |
| Decline | solved to land on `MISS_LAND` behind and left of the board, 2.0 rev/s backspin; passes rim height screen-left of the rim | 10 | 4.95 m/s → 74 cm hop; the backspin checks its 0.88 m/s run to 5 cm/s, then the bounces carry it back 16 cm at 7.6 cm/s (the spin–floor coupling's rolling drift) | 8.3 % | 5.10 s (bounces end 4.44 s, then a 2.4 cm roll) |
| Host | a low bounce pass, 1.9 rev/s backspin (12 rad/s); its speed solved (bisection) so it rests exactly on the guest spot | 5 | 1.6 m/s, checks, hops 7.7 → 1.6 cm, rolls 38 cm into place | 2.7 % | 3.87 s |

**The net on the ball** (`NetDrag`): while the ball's cross-section reaches past the net's hanging envelope it is braked
in proportion to the overlap (rate solved so it leaves falling at **0.85** × its entry fall speed: 6.23 → 5.40 su/s;
its whole speed 6.57 → 5.41 su/s, **82 %**), its drift towards the board is handed back out (0.16, 0, 0.30 su/s) and
its backspin is gripped. Passage 0.18 s. *(Round 1: 0.6 × — the elastic-sock catch.)*

**Spin before the launch** (polish round): on the floor the ball's spin is its roll (ω = v / R along the gather, a
visible cause); the backspin arrives with the launch impulse, blended in over the hand's last 30 ms (`SPIN_FROM`), and is
integrated exactly (`gatherAngle`), so the spin rate is continuous into the flight.

**Tails.** A real ball keeps bouncing for seconds after the beat that matters. The director's durations stay the
approved ones; the rest of each track is the sequence's tail, which `SportsScene` plays in its continuous channel:
when the director ends a sequence with `pose(final)` right after sampling it, the scene starts the tail; `simulate`
advances it at the fixed step, `settling()` keeps the loop running until it ends, and `settle()` snaps it to its end.
The canonical poses (posters, reduced motion) are the tracks' rest states. Tails past each beat (e 0.77, 1 cm stop):
**host 2.67 s** (bounces end 0.1 s after its beat, then the 38 cm roll into the guest spot), **accept 3.00 s** (bounces
end 2.35 s after the beat), **decline 3.50 s** (bounces end 2.84 s after the beat, then a 2.4 cm roll). Round 1: 2.8 /
4.0 / 4.7 s. Getting the decline under 3 s would need e ≈ 0.72–0.74 (below FIBA's band) or a stop at a 4–5 cm hop
(a visible dead stop); the airball falls from 1.34 m, so its bounces are the longest. The net keeps swinging for ≈ 4.5 s after
the swish, so the render loop idles ≈ 5.5 s after an accept starts and ≈ 5.1 s after a decline.

### Change of mind (polish round)

`src/scenes/sports/change.ts`. Round 1 let the director blend or cut: a decline mid-flight reversed the ball in one
frame and slid it 7.1 m/s in a straight line to the guest spot; a decline at the rim teleported it 128.7 cm, during the
tail 68.2 cm. Now the scene answers `interruptCut()` with true (as Party and Business do) and, at the cut, plans a
**change track** from the exact state on screen (position, velocity, spin, orientation) to the new outcome's rest, made
of the same physics:

1. **The ball carries on** under gravity to its next floor contact (a shot in flight finishes, through the net if it
   was going in; a bounce lands). Rolling or at rest, it is on the floor already.
2. **The hand acts through the floor**, as at every launch: at that contact the bounce is redirected (its squash
   follows the larger impulse); a ball on the floor is grabbed (stops in a few cm), gathered and launched.
   - To decline: it keeps the bounce's own height and rolls on at the speed (solved in closed form) that brings it to
     rest exactly on the declined spot.
   - To accept: a bounce-shot (or a gather and shot) with the made arc's apex and backspin, through the net at the
     canonical braking, its hand-back aimed (Newton on the exit drift; the net's linear relaxation gives the gain) so
     the bounces end exactly on the accepted spot. From behind the board or under the rim the ball is first hopped to
     the guest spot.

Measured (`scripts/_scratch`-style sweep over 12 change times each way): the change track starts exactly where the ball
is (gap 0), ends within 2 × 10⁻⁷ su of the rest spot; planning costs 0.2–3.3 ms (accept → decline) and on average
4.1 ms (decline → accept; 60 plans; 3.5–17 ms single runs on a loaded machine), once, at the cut. The only hand-over the
director still blends is the first 0.1 s of a gather (the ball on the floor at the guest spot). The net's and the hoop
springs' motion is carried across the director's settle (`refresh()` restores it).

The seam frame: guest-ready keeps the exact v1.2 orientation (`GUEST_ROT`), so `SEAM_FRAME` still shows "( + )"; the
host-ready orientation is whatever makes the physical pass end in it.

## #9 The net: the master's cord lattice, simulated and skinned

`models/sportsNet.ts`.

- **Lattice read from the master** (`analyseNet`): the master net is a knotted diamond net whose every cord piece and
  knot half is its own mesh component. Its structure is read back at load: **10 loop attachments** (pinned to the rim),
  **6 rows × 10 knots** (the simulated nodes), **120 cord pieces** (loops → first row, then each knot to two below),
  10 tails. Validated in a unit test against the exported GLB.
- **Simulation** (`NetSim`): Verlet positions with XPBD constraints, **fixed 1/480 s substeps on the sim's own clock**
  (an accumulator: whatever frame steps the director's stepper hands it, the net integrates in the same steps; a varying
  step misreads Verlet's velocity and one XPBD pass hangs a little differently at each step size, which kept the net in
  a 0.3 mm shimmer that never settled), one pass each. Gravity 9.81 m/s². Mass 40 g over the knots (±10 % seeded jitter,
  mulberry32 seed 7). Cords: tension-only (slack in compression), compliance **0.002 su/N** (a 5 cm piece of 3-ply nylon
  cord stretches 0.7 mm, **1.4 %/N**; round 1: 9 %/N, the rubber band). Shear springs on both diamond diagonals,
  compliance **0.4 su/N** (the knots' and braid's stiffness: the net keeps open diamonds). **No crossing** (polish
  round): hard minimum distances, so pressed cords bunch and never pass through each other: neighbouring knots in a row
  ≥ 70 % of their hanging spacing, a knot and the one two rows below ≥ 55 %, and a cord running through a knot never
  folds back (its ends ≥ 80 % of their straight-through distance). Air drag **1 /s**. Ball contact: knots inside the ball
  sphere (+ 1.8 cm knot radius) are pushed out along its normal, their tangential velocity relative to the ball's
  surface cut by **30 %** (the cords slide on the leather; round 1: 70 %). The board face is a wall. The net steps along
  the ball's own track, not frame to frame.
- **The hang** (`NET_HANG`, polish round): the master's envelope, its lower half opened so the bottom ring's inner
  opening is **1.13 × the ball** (round 1: 1.02, so the ball had to stretch the bottom open: the sock). The hanging rest
  pose is the equilibrium under gravity on that envelope, solved once at load.
- **Rendering** (`NetSkin`): the strands and knots become `SkinnedMesh`es with one bone per cord piece (frame along the
  cord, radial, binormal; stretched with the cord) and one per knot; **190 bones**, the GPU skins ~76k vertices (the
  shadow pass too). Polish round: the strand vertices within 1.4 cm (0.04 su) of a knot blend between the cord's bone and the knot's (two
  bones per vertex), so no hairline seam opens where a strand meets its knot. The loops stay on the rim. The skeleton's
  bone texture is freed with the scene.
- **What it does** (unit test on the GLB lattice, accept track): woken as the ball nears, knots pushed up to 4.8 cm out
  round the ball and never inside it; the ball leaves at **82 % of its entry speed** with no catch and no release
  (no rubber band); the bottom flips up 2.1 cm as it leaves, swings, is all but still (every knot within 5.4 mm of rest)
  2 s after the ball has left, and snaps to rest when its last sub-millimetre sway dies (4.5 s after contact). The
  decline and host never wake it.
- **Rim and board** (`HoopSprings`): the pinned constraints' multipliers give the net's actual pull on the hooks (peak
  **4.0 N** on a swish; its change from the hanging net's own 0.39 N drives the springs). The spring-action rim: I 0.045
  kg·m², 80 N·m/rad, ζ 0.15 (7 Hz), with a hard **back stop at −0.42°** where the bracket plate meets the board face;
  the board on its pole: I 0.27 kg·m², 2500 N·m/rad, ζ 0.06 (15 Hz). Measured on the swish: **rim +0.59°, back onto
  its stop; board 0.03°** (round 1: +1.3° / 0.05° with the elastic net). The fixed 2.5°/0.6° of v1.2 is gone.
- **Interruptions**: the director settles before it cuts; the scene keeps the net's and springs' motion across that
  settle (`refresh()` restores it), so a change of mind with the ball in the net leaves the net swinging while the ball
  carries on. Reduced motion, replay and reset never refresh, so there the net stays snapped to rest.

### Frame cost (this laptop, M2 Pro)

- Node (V8) micro-benchmarks, over several runs: net simulation **0.12 ms per 60 fps frame** (two 1/120 s steps, ball
  in the net; 0.12–0.19 ms at load average 24–33); bones from the simulation + matrices + skeleton **0.05–0.06 ms**.
  Load, once: lattice analysis 27–54 ms. A change of mind's planning, once at the cut: ≤ 3.3 ms to decline, 4.1 ms
  average to accept (above).
- Headless Chrome, 390 × 844 @3x, Normal tier, vsync off (frame time = work): accept p50 **1.2 ms** / p95 3.1–3.3 ms
  during the sequence, p50 1.7–1.8 ms / p95 3.1–3.3 ms during the tail (ball + net); decline p50 1.1 ms / p95 3.0 ms and
  p50 2.0 ms / p95 3.0 ms. With vsync: p50 16.7 ms, p95 16.7 ms, max 16.8 ms, no dropped frames. The render loop idles
  once the tail and the net have settled (idle check: 0 frames per 2 s from ≈ 6 s after an accept).
- The unit test on the net's cost (`tests/netCost.ts`) measures it against a fixed reference kernel timed in the same
  process (fastest of 15 interleaved rounds, retried up to 4 times), so machine load cannot fail it: ratio 0.45 here
  (0.44–0.71 at load average 24–33), bound 2 (0.52 ms per frame at this machine's speed).

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
   nylon-elastic cords and the leather's grip: 6 cm flip, visible sway to ≈ 2 s. *(Overdone: the polish round's judges
   read it as an elastic sock; see below.)*
5. *The rim jumps when the net wakes* (the hanging net's own weight torque appeared from 0). **Fixed**: the springs feel
   only the change from the hanging net's pull. *The rim swings back through the board.* **Fixed**: hard back stop.
6. *A drawn ball dips into the floor by 10 µm mid-contact* (squash interpolated linearly against a Hermite centre).
   **Fixed**: squash is Hermite-interpolated with its rate, so the bottom is exactly on the floor through every contact.
7. *A bone texture leaks per scene visit* (browser Low-tier test). **Fixed**: the skeleton is disposed with the rig.

Still open (judged acceptable, recorded):
- The ball is smaller on screen than in v1.4 (5.9 % of the frame height): the cost of real proportions (above).
- The host pass's tail is a 2.6 s slow roll (38 cm) into the guest spot: with c_rr 0.02 a ball delivered to rest at a
  spot either rolls slowly or bounces many times; physics, not choreography.
- The declined tail is 3.5 s past its beat (bounces end at 2.84 s, then a 2.4 cm roll), over the judges' ~3 s: the
  airball falls from 1.34 m. Shortening it further would need e below FIBA's band or a visible dead stop (above).
- The squash reads on 1–2 frames at 60 fps and is 2–3 px at 540 px (physical amplitudes).
- The hoop's cast shadow still climbs the cove at the right (as in v1.4).
- The rim recoil (+0.59°, ≈ 1 px at 540 px) is real-sized, so barely visible; the net carries the swish. The judges
  read its slam onto the −0.42° stop as fine at 1 px; left.
- The lookdev page's v1.1 code-authored hoop keeps its own net, which the lattice analysis rejects: it stays static.

## Polish round (judges' findings, 2026-10-02)

| # | Finding | Fix | Measured now |
| --- | --- | --- | --- |
| 1 | A change of mind reverses a flying ball in one frame and slides it 7.1 m/s to the guest spot; at the rim it teleports 128.7 cm, in the tail 68.2 cm | `interruptCut()` → the change track (above): the ball carries on under gravity, the hand acts through its next floor contact, it bounces and rolls to the new rest | start gap 0, end ≤ 2 × 10⁻⁷ su from the rest spot; strips mid-flight, at the rim, in the tail, both ways |
| 2 | The ball spins up on the floor before launch | The spin on the floor is the gather's roll; the backspin arrives with the launch, over the hand's last 30 ms | spin rate continuous, integrated exactly |
| 3 | The decline pogoes: 21 bounces in place | e 0.77 (FIBA 2026), the stop at a 1 cm hop, then a rolling transition; the spin–floor coupling carries the bounces back | 10 contacts, drifting 16 cm at 7.6 cm/s, then a 2.4 cm roll |
| 4 | The net is an elastic sock | Bottom opened to 1.13 × the ball; cords 1.4 %/N; grip 30 %; braking to 0.85 × the fall | exit 82 % of entry speed, hooks 4.0 N peak, rim +0.59° |
| 5 | The bottom tangles after the ball leaves | Hard minimum distances between knots (row, two rows down, through a knot) | no crossing in the 2000 px close-up or the 4000 px macro |
| 6 | Contacts drawn at 30 ms; tails 4.5–5 s | Contact 20 ms (1.2 frames); e 0.77 and the 1 cm stop | host 2.67 s, accept 3.00 s, decline 3.50 s past the beat |
| 7 | The cream ball disappears at 540 and 192; the stand materials have no maps; hairline seams at the knots | Cream albedo from a near-white (236, 229, 212) to a warm buff (231, 207, 163) that separates from the cool stage by hue (the seams keep their dark colour); the stand's PP micro-normal / roughness and powder-coat grain (deterministic 512² WebP via a recipe `finish` hook); two-bone skinning at the knots | `stills/v1.5-cream-540-and-192.jpg`, `stills/v1.5-stand-macro.png`, `strips/accept-net-macro-4000px.jpg` |

Found on the way: the integration branch's stepper splits each frame into equal steps ≤ 1/120 s, so the net saw
varying steps and never settled (0.3 mm shimmer, rim at 5 × 10⁻⁶ rad): the render loop never idled and the browser
"Pointer drags" test failed. Fixed by the net's own 1/480 s clock. Planning a change of mind to accept cost 12–14 ms
in one frame; now 4.1 ms average (the net's hand-back aimed through its linear gain instead of a fixed point inside a
Newton loop; the net's engagement integrates only the depths the ball spans). The net-cost unit test failed once under
seven headless Chromes; it now measures against a reference kernel (above).

## Tests

Round 1: unit 286, browser 87. Polish round, merged with `v1.5/integration` 79a061a: unit (`pnpm test`) **391
passed** in 29 files (`tests/sports.test.ts`: 48, now with the change of mind, the net's hang, its rolling stop and the
load-robust cost test; it passes at load average 24–28 too); browser (`pnpm test:browser`, port 5504) **95 passed**.
`pnpm typecheck` clean.

## Evidence (`evidence/v1.5/sports/`)

- `stills/`: `v1.4-before-guest-ready.png`, `v1.4-before-fullscreen-1440x900.png`; `v1.5-{host-ready,guest-ready,accepted,declined}.png`
  (720 px), `v1.5-cream-{guest-ready,accepted,declined}.png` (1080 px), `v1.5-cream-540-and-192.jpg` (the cream ball at
  540 and 192 px), `fullscreen-{desktop-1440x900,tablet-768x1024,phone-390x844}-{guest,accepted}.png`,
  `v1.5-stand-closeup.png`, `v1.5-stand-macro.png` (the PP base and powder-coated pole).
- `strips/` (`scripts/sports-strips.ts`: a 62.5 fps virtual clock, 16 ms per frame, as `pnpm capture`):
  `{accept,decline,host}-overview-every6.jpg` (6.5 s, tails included), `accept-net-passage-60fps.jpg`,
  `accept-net-key-frames.jpg`, `accept-net-whip-and-settle-every2.jpg` (2000 px close-up), `accept-net-macro-4000px.jpg`
  (the knots' skinning), `{accept,decline}-first-landing-60fps.jpg`, `accept-floor-contacts-before-the-base.jpg`, and
  the change of mind: `change-accept-to-decline-in-flight-0.5s.jpg`, `change-accept-to-decline-at-rim-0.95s.jpg`,
  `change-accept-to-decline-in-tail-2.5s.jpg`, `change-decline-to-accept-in-flight-0.6s.jpg`,
  `change-decline-to-accept-in-tail-3.0s.jpg`.
- `motion/`: `accept.mp4`, `decline.mp4`, `host.mp4` (6.5 s at 60 fps), `accept-net-closeup.mp4`, and the five
  `change-*.mp4` (8.5 s each).

`pnpm models sports` is deterministic (polish round: two exports, SHA-256 f3631871…2136 both times; round 1:
7546501e…e755): 263,098 triangles, 12 draw calls (+ 1 shadow proxy), 23 nodes, 20 textures (the stand's four maps
new, 512² WebP, 360 KiB). The Sports posters (both presets, four poses), the collection thumbnail and the
Sports fullscreen backdrop were regenerated (`pnpm capture sports`, `pnpm capture backdrops`: only Sports' backdrop
changed, the other four came out byte-identical and were left alone).
