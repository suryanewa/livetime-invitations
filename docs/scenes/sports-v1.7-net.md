# Sports v1.7: the net rebuilt (#44)

Surya, 2026-10-06: *"I'm also completely dissatisfied with the net physics; it just vibrates really weirdly and
unrealistically."* Decision #44 (`docs/revisions-v1.7-brief.md`): rebuild the net in place behind the same interface — hung
slack, XPBD with real damping, a ball contact that injects no energy, a calm skin, render interpolation, the rim's ring
damped.

Branch `v1.7/sports-net` from `v1.7/integration` a157690. Files: `models/sportsNet.ts` (NetSim, HoopSprings, NetSkin, the
binding in `analyseNet`), `src/scenes/sports/net.ts` (the channel), `models/sportsContract.ts` (the NET_HANG note),
`tests/sports.test.ts` (the net suite), `tests/sportsSprings.test.ts`, `tests/netCost.ts` (unchanged), this file and
`docs/spec-revisions.md` (#44). The interface the scene composes is unchanged: `SportsNetChannel { follow, forget,
step(dt, target, drawn), settling, settle, restore }`, `HoopSprings.kick`, `rigNet`/`NetSim`/`NetSkin` as before.
`src/scenes/sports/index.ts` is untouched.

All numbers come from `evidence/v1.7/sports-net/tools/net-probe.ts`. It drives the real channel the way the controller
does: the director's sample, then the FixedStepper's equal steps of at most 1/120 s, the tail, then the ball at rest. It
measures what is drawn: the skin's bones, carried into hoop space by the drawn recoil, on the accept track. "Before" is
the same probe run on a157690.

## The diagnosis: confirmed, with one correction

| # | The reconnaissance said | Measured on a157690 (120 Hz, drawn) |
| --- | --- | --- |
| 1 | Incoherent knot motion: 92 % knot-relative, adjacent knots antiphase, 2–2.5 Hz knot pendulums against soft undamped diagonals | **Confirmed.** Bottom ring over exit + 0.25…2.25 s: rigid sway 0.80 mm RMS against 7.16 mm knot-relative; adjacent knots' tangential correlation −0.13 (in-plane −0.15). By angular mode, the knot-level modes dominate: n3 4.7, n4 4.2, n5 1.8 mm, against translation n1 1.2 mm. The ring's mean position peaks at 5 Hz (x) and 7.15 Hz (z), sub-millimetre |
| 1′ | (the diagonals are "soft") | **Correction.** Gravity does not sway the net as a whole: the diamond diagonals (6.9 N/m each) are stiff *relative to gravity* for the collective mode. With the new integrator and those diagonals, the ball dragged the bottom ring 34 mm aside and it sprang back at ≈ 7 Hz, a lattice mode rather than a pendulum. Softening them lets gravity close the net into a sock (bottom opening 0.92× the ball at 100× softer). Hence the preload below |
| 2 | The skin amplifies it: knot frames from the two upper neighbours, tails welded on, strands scale with their cords | **Confirmed.** Knot tilt from rest up to 66°, still 22.9° after exit + 1 s; tilt rate 1334°/s after exit + 0.25 s (3185°/s peak); strands drawn at 0.90–1.016 of their length after exit |
| 3 | Pre-tension: rows 3–4 at 0.7–1.4 % strain at rest | **Confirmed.** Rows 3 and 4 at 0.73 % and 1.38 % mean (max 1.45 %), ≈ 0.5–1 N per cord |
| 4 | Under-convergence: one Gauss–Seidel pass in mesh order, α̃/Σw ≈ 0.055 | **Confirmed** (α̃/Σw = 0.054 for the cords) |
| 5 | Cadence: 5/6 and 3/4 substeps per frame at 90/144 Hz, no interpolation; the rim rings for ≈ 0.5 s | **Confirmed.** The four display rates disagree by up to **1.3 × 10⁻² su (4.8 mm)** at shared times. The rim is quiet (< 0.05°) only 0.46 s after contact. Settle 4.33–4.35 s after exit (this probe's definition: net and springs both asleep) |

KE did decay after the ball left, with no blow-up. The "vibration" was the five compounding effects, not instability.

## What was built

**Step 2: the slack hang.** Each cord's rest length is its distance on the NET_HANG hang × 1.005 (`NET_SIM.cordSlack`),
not the master's length. NET_HANG and its 1.13× bottom opening are kept. At rest every cord is within −0.06…+0.37 % of
its length (was up to +1.45 %). Rest rows: radius 13.62 / 11.97 / 11.14 / 11.58 / 11.83 / 11.59 cm at y −11.3 … −30.0 cm
(v1.5: 13.61 / 11.90 / 10.93 / 10.91 / 11.02 / 11.21 at −11.2 … −29.0). With the pre-stretch gone, the opened rows sit
0.4–0.8 cm wider and the bottom 1 cm lower. The bottom opening is 1.21× the ball. The Sports posters still match the
live scene (`posters.spec.ts`: 0.00 % of pixels past threshold, mean 1.1/255). Stills:
`stills/net-at-rest-before-after-diff.png`.

**Step 3: XPBD, ordering, damping, contact** (`NetSim`):
- **Integration:** explicit velocities at fixed 1/480 s substeps. Air drag is applied before gravity, so the rest pose
  is the substep's exact fixed point.
- **Passes:** two constraint passes per substep, each multiplier accumulated across them. The order is fixed and
  topological: cords and diagonals from the rim down, then the hard limits; the second pass bottom up.
- **Constraint kinds:** cords tension-only (λ ≤ 0); the no-crossing limits push-only (λ ≥ 0, unchanged at 70 / 55 / 80 %).
- **Preloaded soft diagonals:** the shape is relaxed with the old stiff diagonals (`shapeCompliance` 0.4 su/N). Each
  diagonal then keeps the multiplier it applied at that pose, but answers any change of it with `shearCompliance`
  150 su/N: rest length d + α̃·λ. The open shape holds (it drifts 12 µm), and the net swings on gravity.
- **Damping:** air drag 3/s. The knots' internal friction (`coupling` 8/s) damps the relative velocity of every pair of
  neighbours (cords and row neighbours), momentum kept. It kills a knot's own pendulum and the diamond scissor within a
  cycle, and leaves the whole-net sway to the drag.
- **Ball contact:** the ball is a moving sphere sampled on its own path at every substep. Along the normal the contact is
  inelastic: never pushed off faster than it was moving away. Along the surface, the slip decays at a grip rate
  (250/s) plus Coulomb μ 0.8 on the normal change. Neither can reverse the slip, so no energy goes in. The grip gives
  hooks 4.3 N, which matches the ball's own braking in the net on its prescribed track (4.0–5.6 N, impulse 0.66 N·s,
  computed from the track). Pure Coulomb gave 1.8 N: physically inconsistent with that braking.
- **Loops on the recoil:** the loops ride the rim's and board's recoil as kinematic pins, and the net itself is
  simulated in the hoop's rest frame. The rim's ringing therefore drags the net's top instead of rotating the whole net
  rigidly (v1.5's rigid shake).

**Step 4: the skin and the clock:**
- **Strands:** each strand has two bones, its halves, and is drawn at its rest length. When its knots come closer, it
  bows (the halves meet at a middle sagging down and out). When pulled, it stretches only by its real strain. The binding
  is re-derived in `analyseNet`: four weights per vertex, halves blended across the middle fifth, the knot blend at the
  ends kept. The master's lattice is kept: 10 loops, 60 knots, 120 cords, 10 tails, 310 bones.
- **Knot frames:** each knot's up comes from all its cords (up the two above, down the two below; the bottom row from
  its cords and its row's run), smoothed with its two ring neighbours. The tails hang from those frames.
- **Clock:** the net keeps its own 1/480 s clock, locked to the run's time. A resting net takes the run's clock, so every
  display rate integrates the same substeps at the same times. It runs at most one substep ahead and the skin draws
  between the last two at exactly the director's time (`alpha`); the recoil is interpolated too.
- **Wake and sleep:** a resting net wakes on the substep the ball comes near or the springs are struck. It settles on the
  substep its motion has died.
- **No lead or lag:** the drawn net and the drawn ball are at the same time to the floating-point bit, so the ball needs
  no interpolation (nothing for `index.ts`).

**Step 5: the rim.** ζ 0.15 → **0.4**. The rim's 7 Hz ring is under 5 % of its first swing from 0.2 s, and quiet 0.25 s
after contact (was 0.46 s). The springs are stepped on the net's substeps (`HoopSprings.substep`); `step(dt)` and `kick`
are kept for the decline owner. `active()` says a strike is big enough to stir a resting net.

**Step 6: the settle.** Per substep: every knot slower than 0.01 su/s and within 0.002 su (0.7 mm) of rest, with the ball
away, snaps exactly to rest, and `settling()` goes false so the loop idles. `settle()` is exact: positions equal the rest
pose and the springs read 0. `save()`/`restore()` carry positions, velocities, the clock and the ball's last position, so
a change of mind continues the swing exactly. The test compares an uninterrupted run with one settled and restored at
1.3 s: they agree to 1 × 10⁻¹². Through the real controller, a change of mind at 1.25 s shows no pop
(`strips/change-accept-to-decline-at-1.25s-every16ms.jpg`).

## Targets, before → after (120 Hz; the four display rates agree)

| Target | Before | After | |
| --- | --- | --- | --- |
| Settle after exit (1.2–2.5 s) | 4.33 s | **1.62 s** (60/90/120/144 Hz: 1.62/1.61/1.62/1.62) | ✓ |
| Late swing at exit + 2 s (≤ 1.5 mm) | 5.4 mm | **0** (at rest) | ✓ |
| Ring's mean lateral position: spectral peak (0.7–1.3 Hz) | 5 Hz x / 7.15 Hz z, ≈ 0.3 mm | **1.15 Hz** x and z, 0.85 / 0.51 mm | ✓ |
| … its ≥ 8 Hz / < 8 Hz power (< 0.05; Hann-windowed) | 0.004 / 0.050 | **0.00002** | ✓ |
| KE below 1 % of its post-exit peak within 1.5 s | 1.19 s | **0.48 s** | ✓ |
| Mechanical energy (KE + gravity + elastic) never up > 5 % frame to frame after exit | n/a (no velocities in v1.5) | **0.77 %** max while above 2 % of its peak | ✓ |
| Knot tilt rate after exit + 0.25 s (≤ 300°/s) | 1334°/s | **185°/s** (rows 0–5: 15/40/84/126/160/185) | ✓ |
| Knot tilt from rest after exit + 1 s (≤ 5°) | 22.9° | **1.2°** | ✓ |
| Strand drawn length after exit (0.97–1.06) | 0.902–1.016 | **1.000–1.005** | ✓ |
| Bottom ring: rigid RMS ≥ 2× knot-relative RMS | 0.80 / 7.16 mm (0.11) | 3.06 / 3.85 mm (**0.79**) | see below |
| Adjacent knots' tangential correlation ≥ 0.6 | −0.13 | **0.43** (in-plane displacement **0.75**, was −0.15) | see below |
| Wake (after release, by contact) | 0.49 s | 0.42 s | ✓ |
| maxOpen > 0.06 su | 0.135 | 0.126 | ✓ |
| minGap (knot centre to the ball's surface ≥ knot radius) | 0.0172 su | **0.0180** (exactly the clearance) | ✓ |
| Whip: bottom row lift after exit | 0.063 su (2.3 cm) | 0.123 su (4.4 cm) | ✓ |
| No crossing: ring neighbours ≥ 70 %, two rows ≥ 55 % (hang spacing) | min 86 % / 87 % of rest | min 70 % / 54 % of rest: the knots bunch to the limits, never through | ✓ |
| Hook force (2–15 N) | 4.30 N | 4.29 N | ✓ |
| Rim (0.3–3°, never below the back stop) | +0.59° / −0.42° (on the stop) | **+0.45° / −0.11°** (never reaches it) | ✓ |
| Board (< 0.2°) | 0.030° | 0.029° | ✓ |
| Rim quiet (< 0.05°) after contact | 0.46 s | **0.25 s** | ✓ |
| Determinism, 60/90/120/144 Hz, shared times | up to 1.3 × 10⁻² su | **≤ 4.4 × 10⁻¹⁶ su** | ✓ |
| Cost per 60 fps frame (simulation, ≤ 2× the reference kernel) | 0.113 ms (0.45×) | **0.136 ms (0.51–0.54×)** | ✓ |
| Cost per frame, skin (update, matrices, skeleton) | 0.045 ms (190 bones) | 0.073 ms (310 bones) | |
| Load, once: NetSim (the rest relaxation) | 22 ms | 56 ms | |

**The two coherence targets as literally defined.** The decomposition shows what the remaining "relative" motion is:
breathing (n0 radial) 3.0 mm and ovalling (n2) 1.1 mm, the ring opening and closing as the net bounces. That is the
lattice's own coupling (a diamond that gets taller gets narrower) and a whole-ring, coherent motion. The knot-level modes
fell 10×: n3 4.7 → 0.43, n4 4.2 → 0.75, n5 1.8 → 0.32 mm. The adjacent *tangential* correlation is ill-posed: a perfectly
rigid translation along one axis scores only +0.6, because two of the ten pairs straddle the axis and anti-correlate. The
in-plane correlation, which compares full displacement vectors, measures coherence directly: 0.75. I kept the literal
numbers in the table and test the in-plane one.

**Literal KE "never rising > 5 % frame to frame"** cannot hold for anything that swings: KE is zero at each turning point.
The test and the probe check the mechanical energy instead (KE + gravity + the cords' and diagonals' elastic energy, the
sim's own state). Below 2 % of its peak, the stiff tension-only cords' elastic energy ripples by up to 0.07 % of the peak
(a two-pass XPBD is not exactly conservative); it even goes 0.01 % below rest. Invisible, recorded.

**The sway frequency.** The brief's 0.9 Hz assumed a simple 31.5 cm pendulum. A net clamped all round the rim sways
faster on gravity alone: 1.35–1.45 Hz with near-zero diagonals and v1.5's damping. With diagonals 150 su/N and drag 3/s
it is 1.15 Hz, inside the band.

## The look

Judged on the 16 ms strips through the real controller, at laptop (900 px at 2×) and phone (390 px at 3×), on the
2000 px close-up and on the 4× crop of the bottom ring.

Before, the net barely reacts as a body. After the ball has gone, its outline keeps changing shape frame to frame: the
bottom ring's knots flick independently, the tails point a different way in every frame, and it is still going 2 s
later.

After, the ball pushes the net open and the front cords wrap it; the bottom ring is dragged down onto the ball and
pinches above it as it leaves. The bottom then whips back and swings as a whole, to the left, back right, smaller, and
the net hangs still from about 1.5 s, settling exactly 1.62 s after the exit. Frame to frame the motion is continuous;
nothing buzzes.

One tell remains: a bottom-right tail flicks outward for about 0.1 s while that side of the ring lifts
(`crops/…-after.jpg` 1232–1296 ms). It is a real flop of a free end and reads as such at 4×; at phone and laptop size it
is a couple of pixels. Even the clips' sizes agree with the eye: the "before" clips need more bits for the same frames
(laptop 259 → 212 KB, phone 103 → 84 KB).

## Tests

`tests/sports.test.ts` 54 passed (the net suite through the real channel: the lattice and its four-weight binding; the
slack hang with every cord within ±0.5 % and the rest a fixed point; the made ball, whip and settle in 1.2–2.5 s; the
whole-net sway, 0.7–1.6 Hz with no ≥ 8 Hz buzz, in-plane coherence > 0.6, energy only falling, KE < 1 % within 1.5 s; the
skin's tilt rate, tilt and strand bounds; no crossing; 60/90/120/144 Hz to 1e-9 su; the carry-over and an exact
`settle()`; the recoil, rim quiet within 0.35 s of contact; a kick stirring a resting net, which settles; the cost).
`tests/sportsSprings.test.ts` 4 passed (the first swing against the damped closed form; the ring under 5 % from 0.2 s;
the stops at 1/960 s steps). `tests/browser/sports.spec.ts` 6 passed on a fresh 5703 server (settle within 15 s, the
still matching the canonical pose). `tests/browser/posters.spec.ts` (sports) passed. `pnpm typecheck` clean.

## For the decline owner and integration

- **Framing:** the net swings no wider than v1.5. The furthest knot centre passes the `NET_OUTSET`/`NET_SWING` envelope
  by 0.063 su, during the ball's passage; v1.5 passed it by 0.064 su. The net never comes below `NET_SWING.down`
  (0.144 su to spare). Nothing to change in `index.ts`.
- **The ball:** drawn at the director's time, which is exactly the net's drawn time. No lead or lag, so nothing to
  interpolate.
- **`HoopSprings.kick`:** unchanged, but a strike now **stirs a resting net**. The loops ride the recoil, the net wakes on
  `active()` (rim or board rate above 0.02 rad/s, or rim above 1 mrad), swings a little and settles. A bank off the glass
  will shake the net. The rim's ζ is now 0.4, so the same kick swings the rim to 0.60 × Δω/ω (was ≈ 0.8×) and its ring
  dies in 0.2 s. Recalibrate any strike sized for the old ζ.
- **Changed behind the same interface:**
  - `NetSim.step(dt, ball)` is kept, the loops then held at rest.
  - `NetSim.save()` returns a richer state, opaque to the channel.
  - `HoopSprings` gains `substep`, `prevRim`/`prevBoard` and `active()`; its `save()` tuple is unchanged.
  - `NetLattice.binding` is now `{ index, weight }` (four per vertex).
- **Nothing needed from the recoil block** of the contract (RECOIL_LIMIT, RIM_BACKSTOP, recoilPoint) as it stands.

## Known gaps

- The two coherence targets as literally defined (ratio 0.79, tangential 0.43). See above: the residual is breathing and
  ovalling, not knot noise.
- The rest pose moved by up to 0.8 cm in radius and 1 cm lower, at the bottom. The posters pass their diff, but the
  integration should regenerate the Sports posters with the decline owner's new frame anyway.
- Load: the rest relaxation takes 56 ms once, against 22 ms. It is a two-phase relaxation (the shape, then the soft
  diagonals) that stops at 1e-13 su per substep.
- The bottom knots bunch to the 70 % / 55 % limits at the exit (v1.5 never reached them). The hard limits hold; at 4× the
  pinch above the ball reads as the net closing over it.

## Evidence (`evidence/v1.7/sports-net/`)

- `strips/`: every 16 ms frame unless noted.
  - `accept-net-before-after-every32ms-1.04-1.68s.jpg`: side by side, the comparison to look at first.
  - `accept-net-closeup-every16ms-{before,after}.jpg`: 2000 px close-up, 1.04–1.68 s.
  - `accept-laptop-900px@2x-every16ms-{before,after}.jpg` and `accept-phone-390px@3x-every16ms-{before,after}.jpg`:
    0.96–1.76 s.
  - `change-accept-to-decline-at-1.25s-every16ms.jpg`.
- `crops/bottom-ring-4x-exit-to-exit+1s-every32ms-{before,after}.jpg`: 2160 px, from the exit to exit + 1 s.
- `motion/`: the 62.5 fps clips of each strip, before and after.
- `stills/`: `net-at-rest-2160px-crop-{before,after}.png`, `net-at-rest-before-after-diff.png`.
- `measurements/`: `before-120hz.txt`, `after-120hz.txt`, `before-cadence.txt`, `after-cadence.txt` (60/90/120/144 Hz
  and determinism), `cost.txt` (simulation, skin, load), `before-recon.txt` (the reconnaissance probes on a157690),
  `before-determinism-cost.txt`.
- `tools/`: `net-probe.ts` (every target; `--brief`, `--series`, `--det`, `--energy`, `--set=key=value`),
  `net-strips.ts` (windowed 16 ms strips through the real controller, with crops, the device pixel ratio and clips),
  `cost-probe.ts`, `skin-cost.ts`, `build-time.ts`, `recon-probe1..3.ts` (the reconnaissance's, pointed at their own
  tree).
