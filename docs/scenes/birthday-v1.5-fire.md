# Birthday v1.5: fire (edit #4, and the flame side of #6)

Surya: *"Actual flame and smoke physics for blowing the candles; flame must lead to and connect with
the smoke harmoniously and realistically."* Owner: Birthday fire (branch `v1.5/birthday-fire`). The
cake owner (`v1.5/birthday-cake`) owns the cake, the wax melt and the candle placement.

Files: `src/scenes/birthday/fire.ts` (the physics: pure functions of time, seeded per candle),
`src/render/flame.ts` (the flame, smoke and soot-puff shaders, the Planck table),
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
- **Zones** (judged against the paper's Fig. 2 photograph of a 1.13 mm wick): a faint blue cup
  (CH*, C2* chemiluminescence) round the wick's base; a dark fuel-rich core round the wick; the soot
  (yellow) zone starting at about the wick's top as an inverted U over the core and filling in above
  it; a crisp edge (falloff over a few tenths of a millimetre); a cooler, orange tip.
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
- **The wick** is charred cotton (dark in the flame, as in the photograph) with an **ember**: Planck
  emissive on its top 1.5 mm plus a 0.5 mm glow, dim inside a burning flame, flaring to full 50 ms
  after the flame leaves it, cooling (e-folding 0.8 s, 1,320 K → 900 K) to dark by 3 s.
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
  flame, which shrinks by up to 45 %; halfway, the rest **blows off** and drifts at 0.35× the flow
  while it **cools** (1,250 K drop through the same Planck table): yellow, orange, dull red, dark.

The wave: lift-offs 0.10–0.23 s, out 0.24–0.38 s, nearest the mouth first (front-left to back-right).

**The smoke.** The extinguished flame's last soot and the wick's vapour are one continuous thread:

- **The soot puff** (7 soft Gaussian blobs per candle along the upper, sooty flame): while the flame
  dies each blob rides the flame's own axis and greys as the flame cools (opacity follows the
  extinction, continuous through the moment the front passes it); then it drifts on with the gas,
  rising (hot), widening in the jet and fading within ≈0.5 s.
- **The wick's vapour** (wax vapour condensing into a white-grey aerosol a millimetre above the ember,
  6 ms): a streakline of 64 parcels × 3 strands per candle, from the ember, starting at lift-off.
  Emission: a burst as the flame leaves (e-folding 0.3 s, the wick and pool at their hottest) and a
  cooling tail (1.3 s), each wick with its own strength (0.7–1.1) and cooling time (×0.75–1.25).
  Each parcel is displaced in closed form by:
  - the breath (0.6× the flow from its birth on; line density ∝ emission / transport speed, and the
    turbulent jet widens it by 0.12 per distance carried and makes it wander);
  - a buoyant point-source **plume**, w ∝ (F/z)^(1/3) from rest: **0.48 m/s at 1 cm, 0.38 at 3 cm,
    0.33 at 5 cm, 0.27 at 10 cm, 0.22 at 20 cm** (weaker as the ember cools, w ∝ Q^(1/3));
  - a slow room draft (1.2 cm/s) and lean;
  - the **sinuous instability**: laminar to ≈7 cm (±20 % per plume, lower as the source weakens),
    then waves that grow (logistic over 1.3 cm), with a vertical part in quadrature so they fold
    into curls, a second incommensurate mode, and a seeded intermittency envelope (the column calms,
    kinks, sometimes rolls); above 10 cm two wisps split off the main thread.
  - Width: 1.1 mm at the wick, √t diffusion, turbulent spread above the transition; opacity thins as
    it widens and fades with age (0.7–1.6 s). Ribbons are widened in the vertex shader, never under
    1.3 px (opacity scaled instead, so a 1 mm thread does not shimmer), with a Gaussian section and
    age-driven wisp noise.
- **Colour**: a slightly cool grey (`#7b7c80`): wax aerosol side-scatters less than the lit greige
  cove reflects, so a thin thread reads a little darker than the wall, lighter over shade or cocoa.
- It reads 2.5–3 s and is faded to exactly nothing by **3.8 s after the breath began** (`SMOKE.end`).

## Determinism, the clocks and rest

- Everything is a pure function of time with a fixed seed per candle (`fire.ts`); `simulate` only
  advances clocks. The sequence frame carries each flame's authored state (`frame.flames`) and the
  smoke clock (`frame.smokeTime`); `beforeRender` composes the live flicker on top and draws.
- **The smoke outlives the 1.4 s accept** (durations are unchanged): when the director ends accept on
  its canonical pose, the scene hands the smoke clock to the live clock (`tail`), and `settling()`
  stays true until 3.8 s. `settle()` (reduced motion, interruption, settle deadline) clears it. A
  canonical `accepted` reached any other way has no smoke.
- **`settling()` is true while any flame burns** (it flickers), so the lit cake keeps the loop
  running. Decision recorded: `tests/browser/idle.spec.ts` stays on the default scene (Business),
  which still idles; `tests/browser/birthday.spec.ts` asserts Birthday's own behaviour (frames while
  lit, frames for the smoke after accept, then the loop stops; reduced motion: no frames). The Party
  owner's off-screen pause covers a lit cake scrolled out of view.
- **Canonical poses / posters**: guest-ready = six still, steady flames; accepted = charred wicks, no
  flame, **no smoke** (a frozen wisp is a smudge in a still and would hang in the live scene; the
  smoke is the transient). Reduced motion therefore shows still flames, then the blown-out cake.
- **Decline**: the flames are snuffed as the bin arrives (oxygen-starved: they shrink onto the wick,
  losing their yellow first, by 0.2 s). No smoke: the cake is carried off at once.
- **Interruption** (accept → decline): `settle()` clears the smoke; the blend through guest-ready
  relights the flames, as before.

## The flame-state API (for the melt, #6)

`src/scenes/birthday/fire.ts`:

- `flameState(i, t, sequence, out?) → FlameState`: `{ lit, height, width, tilt, dirX, dirZ, bend,
  neck, lift, cut, cool, intensity, out }`. `height`/`width` are relative to the steady flame
  (1 = 13 mm / 5 mm); `intensity` is the radiant output (0–1); `out` once nothing burns.
- `litTime(i, t, sequence)`: ∫ intensity dt from the start of the sequence (seconds of
  steady-flame-equivalent burning). Guest-ready adds 1 per second on the live clock.
- `flicker(i, liveTime, gain, out)`: the live modulation (`height` ±3 %).
- `sootFormed(lit)`: how much of a growing flame's yellow (and light) has formed.

Suggested melt rate: ∝ `intensity × height` (flicker included or not); everything composes in
`sequences.ts`/`index.ts` as pure functions of time.

## Framing

The hero is measured from the real silhouettes, the fire's quads and ribbons excluded, plus each
steady flame's envelope. Without the 4.5 cm flames the hero is shorter, so at 1:1 the cake is now
0.471 of the width (v1.4: 0.439), held by its height at 0.600; at 3:4 the bin's path slides it 0.19
right of centre (was 0.12). `tests/browser/framing.spec.ts` allows 0.21 for Birthday at 3:4, with
the reason. `birthdayBounds`/`birthdayFramePoints` still use the GLB placeholder's `FLAME_TOP`
(conservative; not binding).

## Cost (M2 Pro, Chrome, 1170² frame, each frame waited on with a 1-pixel readPixels)

| | ms/frame |
|---|---|
| Six flame quads (ray-marched) | ≈0.08 |
| The flames' light on the cake (patched materials) | ≈0.25 (six PointLights: 1.3) |
| Smoke: CPU (18 streaklines × 64 parcels + 42 blobs, closed form) | 0.43 |
| Smoke: GPU (2 draw calls, 2,304 ribbon vertices, 168 blob vertices) | ≈0.1 |
| Live flicker (simulate + compose, lit) | 0.006 CPU |

Lit (perpetual) ≈0.35 ms; worst case (during the smoke) ≈0.85 ms, under the 2 ms budget.

## Verification

- `pnpm typecheck`; `pnpm test`: 297 unit tests (24 files), `tests/birthdayFire.test.ts` new (15): flame size against the paper, 10–12 Hz flicker and exact rest, Planck dimming, `litTime`,
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

- The GLB still carries the v1.1 lathe flame (`flame_NN_mesh`, `FLAME_DRAW`); the runtime drops it.
  The next `pnpm models birthday` (cake owner) can drop it from `models/birthdayParts.ts`.
- The tooling cakes (`models/cake.ts`, study and lookdev) keep the v1.1 view-dependent flame
  (`mat_flame_outer`); the product uses `mat_flame`.
- No smoke on decline (snuffed flames do smoke, but the cake is carried into the bin at once).
- The smoke is not lit by the scene (a fixed radiance tuned to the studio); under another rig its
  grey would need re-judging.
- The flame does not occlude or refract what is behind it (it is an emitter, screen-blended); a
  candle flame is optically thin, so this is right to within its faint soot absorption.
