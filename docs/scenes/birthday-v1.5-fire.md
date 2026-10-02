# Birthday v1.5: fire (edit #4, and the flame side of #6)

Surya: *"Actual flame and smoke physics for blowing the candles; flame must lead to and connect with
the smoke harmoniously and realistically."* Owner: Birthday fire (branch `v1.5/birthday-fire`). The
cake owner (`v1.5/birthday-cake`) owns the cake, the wax melt and the candle placement.

Files: `src/scenes/birthday/fire.ts` (the physics: pure functions of time, seeded per candle),
`src/render/flame.ts` (the flame and smoke shaders, the Planck table),
`models/birthdayFire.ts` (the rig: flame quads, the flames' light on the cake, smoke ribbons),
`models/birthday.ts` (wires it in), `src/scenes/birthday/{poses,sequences,index}.ts`,
`src/render/materials.ts` (`mat_flame`), `tests/birthdayFire.test.ts`, `tests/birthday.test.ts`,
`tests/browser/birthday.spec.ts`. Evidence: `evidence/v1.5/birthday-fire/`.

## What it is now

**The flame** is a laminar diffusion flame on a thin wick, drawn as a camera-facing quad that is
ray-marched (28 steps) through the flame's 3D emission field in its own frame, so a lean away from
the camera foreshortens correctly.

- **Size** from Sunderland et al., *Analysis and measurement of candle flame shapes* (Proc. Combust.
  Inst. 33, 2011): for paraffin on a ≈1.1 mm wick, flame length from the pool Lf = 3.85·L^0.634 mm and
  width at the wick top Wf = 3.38·L^0.201 mm. The master's wick stands L = 4.2 mm above the candle top:
  Lf ≈ 10 mm, Wf ≈ 4.5 mm. Twisted birthday wicks burn a little larger, so the flame is **13 mm from
  base to tip (tip 14 mm above the pool), 5 mm wide, widest at the wick top** (`FLAME_REST`), each
  candle ±7 % (seeded `flameScale`: no two wicks stand the same height). The v1.2 flame was drawn at
  4.5 cm (1.5× the master's already-large 3 cm flame).
- **Zones** (judged against the paper's Fig. 2 photograph of a 1.13 mm wick): a thin blue sheath
  (CH*, C2* chemiluminescence) at the flame's edge round the wick's base, a cup open at the top, not a
  filled bulb; a dark fuel-rich core round the wick; the soot (yellow) zone starting at about the
  wick's top as an inverted U over the core and filling in above it; a crisp edge (falloff over a
  few tenths of a millimetre); a cooler, orange tip. Polish round (judge B): the base read as a pale
  lavender bulb and the wick inside it purple-blue, because the blue emission filled the whole base
  volume and screen-blended over the dark wick. The blue now lives only in a shell at 0.76–1.08 of
  the radius over the bottom 17 % of the flame, so the wick inside reads dark, as in the photograph.
- **Colour is temperature.** Soot radiance (Planck × ε ∝ 1/λ) integrated against analytic CIE 1931
  matching functions (Wyman, Sloan and Shirley 2013) into linear sRGB, tabulated 700–2,300 K, scaled
  so 1,900 K soot is 1. The flame core integrates to ≈5× white and goes through a **per-channel
  camera response** (1 − e^−L) instead of the scene's Neutral tone curve: a hue-preserving tone
  curve turns an overexposed blackbody pink-white, a camera saturates red, then green: orange,
  yellow, warm white, as in photographs. Blended as `screen`. A faint veiling-glare halo (σ 1.7 flame
  radii, 5 %) stands in for the lens's bloom.
- **Live flicker** (`simulate` advances the live clock only): the buoyant toroidal-vortex flicker at
  **11 Hz ±4 % per candle** (Kitahata et al. 2009; Okamoto et al., Sci. Rep. 6:36145: 11.0 ± 0.4 Hz),
  **≤3 % of length**, slowly amplitude-modulated, plus a varicose wave travelling up the flame (±3 %
  radius); each flame wanders ±1° and a shared room draft leans all six together by up to ±2° at
  0.1–0.3 Hz (people round a cake). Under reduced motion, or after `settle()`, the flames are still;
  the flicker fades back in over 0.35 s when simulation resumes (no pop).
- **The wick's life** (polish round, judge B: the blown-out wicks were straight glossy brown sticks).
  Before it is lit, fresh white cotton; lit, it chars black within 0.1 s of burning (`wickChar`, from
  the lit time), goes fully matt and its braid curls the top over by about 1 mm (the wick shader bends
  the top quarter, cubic in height, in real units on the quantized mesh). After the flame leaves it,
  the **ember** (Planck emissive on its top ≈2 mm plus a 0.5 mm glow in the flame shader) flares to
  full 50 ms later and cools (e-folding 0.8 s × each wick's own cooling, 1,320 K → 900 K) to dark by
  3 s, while a **grey ash tip** (top 1.5 mm) forms from 0.3 s and is complete 1.6 s later (`ashAt`).
  The canonical blown-out cake (posters, reduced motion) is charred, ash-tipped and cold. A snuffed
  wick's ember is dimmer (62 %).
- **Light on the cake.** Each flame is ≈1 cd. Its light is added through three's own `RE_Direct` to
  the cake's own materials only (frosting, both presets; candles), with an extended-source clamp
  E = I/(d² + a²), a = 3 mm (the inverse square would blow up at the candle tip). The studio depicts a
  daylit room (≈2,500 lx on the table), so the six flames warm the top tier by ≈+16 % red (measured)
  and each candle's top glows under its flame. The light follows the flame's luminous (soot) output:
  a fresh blue bead lights almost nothing. Six `PointLight`s did the same for 1.3 ms a frame because
  every lit fragment, the full-frame cove included, evaluated them (the cove 80 cm away would get
  ≈0.5 %).

**Ignition (host, 0.84–1.28 s).** Each wick catches once its candle has seated, 20 ms apart; the
flame shows at once as a small blue bead (30 % of the length, 55 % of the width) and grows over
0.34 s, its soot (yellow) forming once it is a third grown. Monotone, never a flash.

**The breath (accept).** A round jet from the guest's mouth on the camera side, 28 cm towards the
camera and 28 cm to its left (`BREATH.mouth`): a lip jet of ≈5–8 m/s decays to **1.6 m/s at the
nearest candle** (U ≈ 6·U0·D/x), 1/d beyond it (1.16–1.6 m/s across the cake). It arrives as a C¹
pulse peaking in 75 ms, the front crossing the cake at 0.9 m/s, ±12 ms seeded jitter. The mouth is
off the camera axis so the bend reads in the picture plane (v1.2 found a pure away-lean
foreshortened to nothing); the flow is away and to the right. Each flame:

- **leans** with the flow at atan(U / w_b), w_b = 0.5 m/s (the flame gas's own buoyant velocity),
  capped at 76°, with a 15–22 Hz ±7 % flutter (the gust is turbulent); **stretches** (×(1 + 0.45r))
  and **thins** (×(1 − 0.3r)), r = U/(U + w_b): ×1.34 and ×0.77 at the nearest candle's 1.6 m/s; its
  tip **curls** back up; its base **necks**;
- **lifts off** when the flow reaches 0.9 m/s: the base hovers 3.5 mm downstream (a lifted flame
  stabilises where the flow has slowed to its burning speed; it is not carried off);
- **goes out from the base up** in 110–170 ms (seeded per candle): the extinction front climbs the
  flame, which shrinks by up to 45 %; halfway, the rest **blows off** and drifts at 0.35× the flow,
  dimming as it goes. Cut off from its fuel the soot burns out in tens of milliseconds, so it stays
  yellow-orange to the end (a 280 K drop through the Planck table, gone by 70 % of the extinction).
  Judge A saw the earlier 1,250 K drop as an orange/dull-red ghost: a blown flame never passes through
  a red stage.

The wave: lift-offs 0.10–0.23 s, out 0.24–0.38 s, nearest the mouth first (front-left to back-right).

**The smoke** (rebuilt in the polish round after judge A: a detached grey puff, a ribbon faint for
5–8 frames, six parallel near-identical sinusoids, charcoal-grey, gone by 2.6–2.9 s, none on decline):

- **One continuous thread from the wick.** The wick's vapour condenses into a white aerosol a
  millimetre above the ember (4 ms): a streakline of 64 parcels × 3 strands per candle, starting the
  instant the flame lets go of the wick (lift-off). The separate soot puff is gone: the flame's own
  body dies out yellow-orange downstream (above) and the ribbon fills the path it took, so flame and
  smoke are one thread with nothing detached and no red stage between them.
- **Dense and white from the first frame.** Emission is a burst as the flame leaves (e-folding 0.3 s,
  the wick and pool at their hottest), then a **smoulder** that thins to a fading thread: e-folding
  4.5 s × each wick's cooling, faded out from 3 s to 5.5 s. Opacity is Beer–Lambert: the column's
  optical depth (2.4 at full emission where it leaves the wick, thinning as it widens and with age)
  gives 1 − e^−depth, ≈0.9 for the fresh ribbon and ≈0.2 for the last thread; the three strands
  share the depth, so where they still overlap low down they composite to exactly the column's
  opacity. A frame after each flame is out the stem within 3 mm of the wick is > 0.65 opaque
  (tested; it read ≈0.4 before).
- **Colour**: wax aerosol is white (sub-micron droplets scatter nearly all the light they catch,
  faintly bluish): linear radiance 1.4 before the tone curve (`SMOKE_RADIANCE`), ≈245 of 255 on
  screen where dense against the cove's ≈210. Judged against the greige stage: the old `#7b7c80` read
  charcoal and a matched `#c9c9cb` vanished into the wall; this reads as a pale wisp over the wall
  and stands out over shade, the bin and cocoa.
- Each parcel is displaced in closed form by:
  - the breath (0.6× the flow from its birth on; the turbulent jet widens it by 0.06 per distance
    carried and makes it wander);
  - a buoyant point-source **plume**, w ∝ (F/z)^(1/3) from rest: **0.48 m/s at 1 cm, 0.38 at 3 cm,
    0.33 at 5 cm, 0.27 at 10 cm, 0.22 at 20 cm** (weaker as the ember cools, w ∝ Q^(1/3));
  - a slow room draft (1.2 cm/s) and lean;
  - **the stirred air** the breath leaves behind: five shared eddies of 6–14 cm drifting at up to
    5 cm/s, divergence-free in plan, decaying (e-folding 2.2 s) into the room's own gentle stirring
    (35 % of it), each parcel remembering ≈0.7 s of it. Shared by all six plumes and evaluated where
    each parcel is, so neighbours bend together, lean towards each other and merge;
  - the **sinuous instability**, decorrelated per plume: its own transition height (laminar for its
    first 4–9 cm: exactly straight at the wick), wavelength (×0.75–1.35), amplitude (×0.6–1.4), the
    beat of its disturbances (0.7–2.2 Hz), phase speed, the plane its waves swing in, and a seeded
    intermittency envelope (the column calms, kinks and only sometimes rolls into a curl); above
    10 cm two wisps split off the main thread.
  - Width: 1.2 mm at the wick, √t diffusion, turbulent spread above the transition and in the jet.
    Opacity thins with that full width, but a thread is **drawn no wider than 4 mm**: a turbulent
    column breaks into wisps rather than widening as one sheet (wide ribbons folding over themselves
    drew hard-edged translucent planes at the plume heads). Ribbons are widened in the vertex
    shader, never under 1.3 px (opacity scaled instead), with a Gaussian section and age-driven wisp
    noise; where a thread points at the camera it blends towards the screen horizontal, so it draws
    as a soft blob of its width instead of a fan of strips (the star-shaped artefacts of the
    earlier ribbons, seen end-on as the breath carried them away from the camera).
- **It rises in the room**, not on the cake: the ribbons hang under `birthday_root` and every parcel
  starts where its wick was when it was born (`WickAt`). On the cake carried to the bin, smoke born
  on the move is strung out along the path, thinner per length with the wick's speed through the air
  (half as dense at 0.15 m/s), and none is born once the wicks are in the bin.
- **Snuffed candles smoke** (decline): a starved flame smokes as it shrinks onto the wick, so each
  leaves a brief, weaker wisp from halfway through its snuff (vapour 0.5–0.7 against a blown wick's
  0.75–1.1, cooling about twice as fast; `SmokeKind` 'snuff'), left rising where the cake stood as
  it is lifted away.
- It is faded to exactly nothing by **6.5 s on its clock** (`SMOKE.end`).

## Determinism, the clocks and rest

- Everything is a pure function of time with a fixed seed per candle (`fire.ts`); `simulate` only
  advances clocks. The sequence frame carries each flame's authored state (`frame.flames`) and the
  smoke clock (`frame.smokeTime`); `beforeRender` composes the live flicker on top and draws.
- **The smoke outlives the sequences** (durations are unchanged): when the director ends accept or
  decline on its own canonical pose, the scene hands the smoke's clock, kind and carry to the live
  clock (`tail`), and `settling()` stays true until `SMOKE.end` (6.5 s on the smoke's clock).
  `settle()` (reduced motion, replay, settle deadline) clears it. A canonical pose reached any other
  way has no smoke.
- **`settling()` is true while any flame burns** (it flickers), so the lit cake keeps the loop
  running. Decision recorded: `tests/browser/idle.spec.ts` stays on the default scene (Business),
  which still idles; `tests/browser/birthday.spec.ts` asserts Birthday's own behaviour (frames while
  lit, frames for the smoke after accept, then the loop stops; reduced motion: no frames). The Party
  owner's off-screen pause covers a lit cake scrolled out of view.
- **Canonical poses / posters**: guest-ready = six still, steady flames; accepted = charred wicks, no
  flame, **no smoke** (a frozen wisp is a smudge in a still and would hang in the live scene; the
  smoke is the transient). Reduced motion therefore shows still flames, then the blown-out cake.
- **Decline**: the flames are snuffed as the bin arrives (oxygen-starved: they shrink onto the wick,
  losing their yellow first, by 0.2 s), each leaving a wisp.
- **A change of mind** (judge A scored the Birthday interruption 2: accept → decline after the blow
  relit all six flames at full size in one frame and deleted the smoke; the melt popped back). The
  scene now carries its live state across the director's hand-over, on the Party/Business pattern:
  `interruptCut()` captures the fire under way (`FireChange`: the breath's or the snuff's kind and
  its clock, from the sequence or the live tail; from a canonical blown-out cake, a fire long done)
  and asks for the 0 ms cut; the change survives `settle()` and `pose('guest-ready')` and the new
  sequence takes it at t = 0 (`sampleSequence(…, change)`). Then the candles the breath or the snuff
  has reached stay out (a flame mid-extinction carries on going out on its own clock), the smoke
  keeps rising on its own clock (identical across the cut, frame for frame), and the declined cake
  carries smoke born on it (`smokeCarry`). **Lit time**: `liveLit` is kept through the cut, and the
  carried flames keep integrating their own burn rate (0 once out), so the melt never pops back
  (tested: no candle's shortening decreases at any frame of the new sequence). Before any fire has
  begun (accept before the breath reaches a flame) the cake blends as before, its lit time kept.
  From the bin (the cake lifted off its stand), the clean cut back to the lit cake on its stand
  stays, as before: the accept then has its candles to blow out. With the bin in view but the cake
  still on its stand, the fire is carried as above.

## The flame-state API and the melt (#6), integrated with the cake branch

(The change-of-mind carry above is the lit-time owner's side of the melt hand-off: `liveLit` and
the carried `litTime` feed the cake owner's `meltState` unchanged.)

`src/scenes/birthday/fire.ts`:

- `flameState(i, t, sequence, out?) → FlameState`: `{ lit, height, width, tilt, dirX, dirZ, bend,
  neck, lift, cut, cool, intensity, out }`. `height`/`width` are relative to the steady flame
  (1 = 13 mm / 5 mm); `intensity` is the radiant output (0–1); `out` once nothing burns.
- `burnRate(i, t, sequence)`: how hard the flame heats its wax, `intensity × min(height, 1)` (a
  flame stretched by the breath is pushed off the wax, so never more than its rest size).
- `flicker(i, liveTime, gain, out)`: the live modulation (`height` ±3 %).
- `sootFormed(lit)`: how much of a growing flame's yellow (and light) has formed.

**One lit-time source** (merge of `v1.5/birthday-cake`, 0fee10c): the cake's `sequences.ts`
`flameScaleOf(sequence, i, t)` is now `burnRate`, so its C¹ lit-time tables (`litTime`,
`GUEST_READY_LIT`, `ACCEPTED_LIT`, `DECLINED_LIT`) integrate the fire's real ignition, breath and
per-candle extinction; `fire.ts` keeps no lit time of its own. At guest-ready the live lit time grows
at the steady flame's rate of 1 (`simulate`), capped at `MELT_CAP`; `settling()` is the OR of the
flames burning, the smoke tail and the melt still forming; `settle()` resets the flicker gain, the
smoke tail and the live lit time. The melt's `candleShortening` lowers the wick and the flame node
(cake), and the fire rig follows it (`FlameRig.shorten`): the flame's base, its ember, its light on
the cake and the smoke's source all go down with the wick. The flame node's counter-rotation against
each candle's seeded lean (cake) is kept; the fire rig converts candle space into the node's frame
through its matrix and takes world up and the breath's direction through world quaternions, so the
flame stands along world up either way. The flames' light is chained after the cake's own shader
patches on every cake material, each candle's own melting wax included.

**The GLB** (`pnpm models birthday`, deterministic: two exports, SHA-1 391e2de2…): the v1.1 lathe
flame is gone (`flame_NN_mesh` dropped from the builder and the contract; `flame_NN` is an empty
anchor at `CANDLE.flameBase`). The real flame's dimensions now live in the contract
(`models/birthdayContract.ts` `FLAME`, `FLAME_TOP` = 14 mm above the wax), and `fire.ts`'s
`FLAME_REST` reads them; the motion bounds and frame points use the real flame top.

## Legibility at the showcase's sizes (integration review)

At its real size the flame is ≈8×24 device px on a laptop (1280×720 @2×) and ≈7×20 on a phone
(390×844 @3×): judged honestly, without help the six read as warm points on candles, not clearly as
a lit cake at a glance. Enlarging the flame would be dishonest; what a camera actually does is.
Glare (lens and sensor point-spread) is a property of the camera, fixed in pixels, not in
millimetres of flame, which is why a small candle flame in a photograph glows larger than it is.
The flame shader adds a screen-space point-spread (`FLAME_GLARE`: σ 1.6 CSS px bleed and a faint
6 px skirt at 8 % of the peak) centred on each flame's luminous centroid. Its peak is the larger of
a **floor** (1.0 on the film's scale × the flame's luminous output: a sensor's bloom has a fixed
pixel footprint, and a flame ≈100× brighter than the room always saturates a few pixels) and 5 % of
the flame's on-screen flux (luminous area × radiance); capped at 0.6× the flame's radiance, so a
large close-up flame shows no blob (the object-space halo, 1.7 flame radii, still frames it there).
Polish round (judge B: the lit read fell apart with size): the floor is what keeps six glowing
points on the 192 px thumbnail and the 540 px card, where the flux share alone faded to nothing.
Verified at 192 px (the thumbnail, rendered through the capture path, `CAPTURE_STAGE_ONLY=1`),
540 px, laptop (1280×720 @2×) and phone (390×844 @3×). Decision: **no size bump**; the flame stays
13 mm.

## Framing

The hero is measured from the real silhouettes, the fire's quads and ribbons excluded, plus each
steady flame's envelope. Without the 4.5 cm flames the hero is shorter, so at 1:1 the cake is now
0.471 of the width (v1.4: 0.439), held by its height at 0.600; at 3:4 the bin's path slides it 0.19
right of centre (was 0.12). `tests/browser/framing.spec.ts` allows 0.21 for Birthday at 3:4, with
the reason. `birthdayBounds`/`birthdayFramePoints` use the real `FLAME_TOP` (contract) since the
integration.

## Cost (M2 Pro, Chrome, 1170² frame, each frame waited on with a 1-pixel readPixels)

| | ms/frame |
|---|---|
| Six flame quads (ray-marched) | ≈0.08 |
| The flames' light on the cake (patched materials) | ≈0.25 (six PointLights: 1.3) |
| Smoke: CPU (18 streaklines × 64 parcels, closed form, shared eddies) | SMOKE_CPU |
| Smoke: GPU (1 draw call, 2,304 ribbon vertices) | ≈0.1 |
| Live flicker (simulate + compose, lit) | 0.006 CPU |

Lit (perpetual) ≈0.35 ms; worst case (during the smoke) ≈0.85 ms, under the 2 ms budget.

## Verification

- After the integration with the cake branch: `pnpm typecheck`; `pnpm test` 307 (24 files);
  `pnpm test:browser` 88. New since: the melt lowers the flame base, ember and light with the wick
  and the flame stands along world up on a leaning candle; the burn rate the melt reads.
- Before it: `pnpm test` 297 (24 files), `tests/birthdayFire.test.ts` new (15): flame size against the paper, 10–12 Hz flicker and exact rest, Planck dimming, `litTime`,
  plume speed 0.25–0.55 m/s at 3–10 cm, smoke from the wick at lift-off and gone by `SMOKE.end`, a
  straight laminar stem (< 1 mm off its chord below 3 cm) under waves above, determinism, the puff
  riding the flame and moving < 3 mm per ms, the ember, the breath strong enough everywhere, and the
  scene's secondary channel (rig, flicker → settle, the smoke tail outliving the sequence, settle
  clearing it). `tests/birthday.test.ts`: C¹ on every flame channel (a velocity jump is told from a
  fast smooth gust by re-testing at h/4), ignition window, the wave order by arrival, extinction
  100–200 ms from the base up, lean ≥ 50°, stretch, neck, standoff, and the in-plane bend.
- `pnpm test:browser` (`BASE_URL=http://127.0.0.1:5503`): 88 tests, including the new Birthday
  live-fire loop test.
- Looked at: close-ups of one candle at 120 fps-equivalent through flame → necking → lift-off →
  extinction → plume; the plume over 3 s; the whole beat through the real controller at 62.5 fps for
  4.2 s (vanilla) and 2 s (cocoa); ignition and snuff; posters; the flame next to the paper's
  photograph. See `evidence/v1.5/birthday-fire/`.

## Known gaps

- The tooling cakes (`models/cake.ts`, study and lookdev) keep the v1.1 view-dependent flame
  (`mat_flame_outer`); the product uses `mat_flame`.
- A change of mind from the bin (or with the cake on its way) cuts back to the lit cake, as before;
  the smoke of that first outcome is not carried across that cut.
- The breath does not bend smoke that is already in the air when it is carried across a change of
  mind (the new sequence has no breath of its own to give).
- The smoke is not lit by the scene (a fixed radiance tuned to the studio's neutral-room rig); under
  another rig its white would need re-judging.
- The flame does not occlude or refract what is behind it (it is an emitter, screen-blended); a
  candle flame is optically thin, so this is right to within its faint soot absorption.
