# Birthday v1.6: the flames (the Hollywood pass)

Surya, 2026-10-02: *"The flames on the cake aren't bad, but are unconvincing; again, I'm expecting
Hollywood CGI level work here."* Owner: flames (branch `v1.6/flames`, port 5602). Brief:
`docs/hollywood-pass-brief.md`. What existed: `docs/scenes/birthday-v1.5-fire.md` (kept: every
physical behaviour, the clocks, the APIs, the smoke).

Files: `src/render/flame.ts` (the volume), `src/render/bloom.ts` (new), `src/render/heatHaze.ts`
(new), `src/render/stage.ts` (their hooks), `models/birthdayFire.ts` (the rig: the twin, the
registrations, the light), `src/scenes/birthday/fire.ts` (the flicker carries its clock and gain),
`src/scenes/birthday/index.ts` (`settle()` returns the live clock to 0), `src/render/materials.ts`
(comment). Tests: `tests/flameRender.test.ts`, `tests/browser/bloom.spec.ts`. Evidence:
`evidence/v1.6/flames/`.

## What was wrong (measured on `main`, against photographs)

At the showcase's sizes the v1.5 flame read as a pale, blurry cream blob with a yellow haze round
it: its luminous edge faded over a fifth of its radius, a painted veiling-glare halo and a
screen-space glare floor washed it (`evidence/v1.5/birthday-fire/flame-vs-reference-photo.png`), it
was screen-blended so the greige wall showed through its body (a cream body, never a hot core with
an orange rim), the blue sheath filled a lavender bulb round the wick, and the wick inside the flame
was lit orange along its length. Its light lit the cake with no shadows, brightest round each
candle's foot, exactly where the candle hides its own flame. It had no glow of its own (the halo was
painted), no heat haze, no internal life.

References: Sunderland et al., *Analysis and measurement of candle flame shapes* (Proc. Combust.
Inst. 33, 2011), Fig. 2; Wikimedia Commons *Candle wick and flame closeup.jpg* (the zones in
colour: white-cream overexposed core, crisp luminous edge with a thin yellow-orange band, the
luminous zone's foot a dome above the wick's bend, a translucent blue envelope with a bright limb,
the curled wick tip glowing orange, the wax top lit from within), *Candle flame - Macro
photography.jpg* (limb brightening of the soot shell: the sides brighter than the middle),
*Birthday cake with seven candles.jpg* (a lit cake in a bright room: white-hot cores, a crisp thin
orange outline, a small soft glow, glowing candle tops), *Candles flame in the wind-other.jpg*
(blown flames: sinuous torn tails, orange tips). Technique: Jimenez, *Next Generation Post
Processing in Call of Duty: Advanced Warfare* (SIGGRAPH 2014: the 13-tap/Karis/tent bloom chain);
SideFX's pyro shading (emission from temperature through a blackbody ramp, absorption from
density); Wyman, Sloan and Shirley 2013 (the CIE fit the Planck table already used).

## The flame: a ray-marched volume (`src/render/flame.ts`)

Kept from v1.5, exactly: the real size (13 mm, 5 mm wide, ±7 % per wick; `FLAME_REST`), the
11 Hz ± 4 % flicker at ≤ 3 % of length with its slow amplitude modulation and the room draft
(`flicker`), the breath (lean, stretch, thin, neck, lift-off with the 3.5 mm standoff, blow-off
drift, extinction from the base in 110–170 ms), ignition, the snuff, the ember's temperature curve,
the wick's char and ash, the smoke, the change-of-mind carry, lit time → melt. Only the drawing
changed.

- **Proxy and box.** The camera-facing quad stays the raster proxy (in front of the flame, so the
  wick inside never depth-clips it), but each pixel now intersects the flame's **box** in the
  flame's own frame (base to tip along the lean; the widest radius, the bend and the turbulence's
  reach round it) and marches **32 steps** (`FLAME_STEPS`) through it, front to back, with a
  per-pixel jittered start (interleaved gradient noise).
- **The wick hides what is behind it.** The ray ends where it meets the wick (an analytic capsule
  from its foot to its curled tip), so the flame behind the wick is not drawn over it; the flame in
  front of it is. The v1.5 wick was lit orange along its length (screen-blended over).
- **The field** (soot loading × Planck emission at a temperature; absorption from the soot):
  - the soot shell is hollow over the dark fuel-rich core and closes above it (limb brightening
    comes from the march itself: the line of sight runs longest through the shell at its sides);
  - its **foot is a dome over the wick's tip** (lowest at the sides, highest on the axis): the
    wick stands in the dark zone, inside the blue cup, as in the macro photograph;
  - its outer sheet is crisp, the last fifth of the radius thinning exponentially and ~300 K
    cooler: an **orange rim** a few pixels wide round a cream core (the sheet is never sharper than
    1.2 px: no stair-steps on a 9 px flame);
  - the soot burns out before the profile closes: a **rounded orange apex** (≈430 K cooler);
  - the just-formed soot at the luminous foot is ≈220 K cooler (orange);
  - the **blue sheath** is a thin shell (0.86–1.06 of the radius) under the luminous foot only,
    never added over the soot (blue + yellow drew a lilac seam), closed under the flame, about a
    third as bright as v1.5's over the wall (it is a dim emitter against a daylit wall);
  - **turbulence**: value noise in the flame's own frame (millimetres), carried up the flame on
    the live clock, warps the field: a tenth of a millimetre at the tip in still air (a laminar
    candle flame is smooth), up to ≈2.5 mm in the breath's gust (`uNoise.y` follows the lean), and
    the soot loading varies by 6 % (30 % in the gust). A domain warp, so the luminous sheet stays
    a sheet.
- **Emission and colour.** Soot's Planck radiance (the v1.5 table, 700–2,300 K) × `FLAME_GAIN`
  3,500 on the rig's exposure (1.15): the core integrates to ≈15–25, ≈20× the lit greige wall, as a
  candle (≈10⁴ cd/m²) is in a ≈2,500 lx room. It goes through a **camera response per channel with
  a little crosstalk** (`FLAME_CROSSTALK` 0.04: a share of the luminance reaches every channel, as a
  sensor's overlapping filters do): red saturates, then green, then blue, so an overexposed 1,900 K
  core goes orange → yellow → **cream-white** ((255, 255, 240)) as in photographs; Neutral tone
  mapping, hue-preserving, turns it salmon-pink (v1.5's finding, re-checked).
- **Absorption = alpha.** Soot's absorption (`FLAME_KAPPA`) attenuates the flame's own far side
  and is its alpha over the scene (premultiplied `One, OneMinusSrcAlpha`): the body has depth and
  holds its colour against the bright wall (v1.5's `screen` let the wall's blue through: a cream
  body). The absorption goes with the radiant output (a dying flame thins away, never a dark ghost:
  the first build drew the blown-off body as a brown smudge).
- **Dying flames** fade faster than they cool (0.65 of the cooling taken off the radiance): the
  blown-off body goes yellow → orange and thins, never a white blade.
- **The ember** keeps its own orange (its glow does not take the path to white) and never blooms
  (it glows on into the decline, down into the bin, where the bloom pass is not depth-tested).

## The bloom (`src/render/bloom.ts`)

The camera's real glare round the flames, replacing v1.5's painted halo and screen-space glare.

- **Design: selective, before the scene, added after it.** Only emitters bloom: what draws in the
  bloom pass is the bloom layer (each flame's **HDR twin**, a second mesh under its quad that shares
  its uniform objects and draws the same field as exposed scene-linear radiance; or any emissive
  mesh marked with `markBloom`). `Stage.render` asks `bloom.prepare` first: if no registered emitter
  is showing (visible up to the stage's scene), it returns at once and the frame is exactly the
  stage's own (no target is bound, no pass runs). Otherwise it draws the emitters into a half-float
  target at the canvas's **CSS resolution** (the glow's reach is in CSS pixels: the same at 1× for
  posters and 2× live, as a sensor's glare has a pixel footprint), then the chain, all in its own
  targets, before the scene's pass begins; after the scene (and the haze) `bloom.composite` adds
  the chain's light onto the canvas, scissored to the reach of the flames the main pass drew (they
  register from their onBeforeRender, `emitBloom`).
- **The chain** (Jimenez 2014): a 13-tap downsample whose first level applies the **soft-knee
  threshold at 1.0** on the exposed scale (knee 0.5) and **Karis-weights** its five groups (no
  single hot texel flickers), **5 levels** (2–32 CSS px), a 3 × 3 tent upsample added level by
  level, `strength` 0.1 (subtle: the glow is about a flame's width round it at the laptop size).
- **Tone mapping: compatible, not before.** The scene keeps its pipeline (straight to the canvas,
  three's NeutralToneMapping at the rig's 1.15 exposure: decided by rendering, the full-HDR
  alternative would put every scene through a multisampled half-float target and a final blit even
  when nothing glows, and change every frame of every scene). The bloom's light is added in display
  space through the same saturating response (1 − e^−0.65·B: 0.65 is the sRGB curve's slope over the
  wall's and frosting's values, so over them it adds what a linear add before the curve would to
  within a few per cent). Its colour is halfway between the flame's own linear radiance and the
  camera's response (a lens's glare carries the flame's orange; the first build's pure-linear glow
  was salmon, G/R ≈ 0.25).
- **Small sizes.** A flame of 1–3 px still saturates them and glares round them: the twin adds the
  sensor's **footprint floor** (v1.5's glare floor, now a bloom source): a Gaussian of σ 1.1 CSS px at
  the luminous centroid, peak 9 × the flame's output, faded out as the flame grows past 18–60 px
  tall. The 192 px thumbnail and the 540 card read as lit candles (evidence).
- **Guards** (all tested):
  - nothing showing → no pass, byte-identical frames: `tests/browser/bloom.spec.ts` captures the
    Party host-ready still and the stage-colour measurement (the empty stage, `captureStill(…,
    { empty: true })`, which `pnpm capture stagecolor` reads) with the bloom on and switched off
    (`bloomTooling.enabled`): identical data URLs, zero passes; Birthday's empty stage the same;
    Birthday's lit cake runs one pass and differs; the blown-out cake none;
  - `tests/flameRender.test.ts`: `prepare`/`composite` touch no renderer state when nothing
    registered (a renderer that throws on any use), a draw into a target never registers, the
    twins are on the bloom layer only and share the flames' uniforms, a blown-out cake registers
    nothing;
  - the capture path is the live path (`Stage.snapshot` calls `render`): `tests/browser/posters.spec.ts`
    holds the recaptured Birthday posters and thumbnail to the live scene;
  - the scene's lights take part in the bloom pass (three keeps one light state per scene: a pass
    with other lights made every lit material look its program up again on the next pass, ≈1 ms a
    frame, measured) but its shadow map is never drawn there.
- **Tiers.** Normal/High: 5 levels. Low: 3 levels (a tighter glow, three passes fewer). Static:
  the poster.
- **Not marked** (a decision for the integrator): the Business reader's glyph (peak 1.95 × the
  status green, ≈1.7 on the exposed scale, above the threshold) and the Party key (≈0.9, under it).
  `markBloom(mesh)` is the one line each needs; marking the glyph draws its whole smoked-glass mesh
  in the bloom pass (its clearcoat highlights would bloom too) and changes Business's accepted and
  declined posters, which are not this owner's; Business is the default scene and would pay the
  pass on every lit frame.

## The heat haze (`src/render/heatHaze.ts`)

The hot plume over a flame bends the light coming through it. After the main pass the canvas under
the plumes is copied (only that rectangle, its size in 64 px steps so it is not reallocated as the
flames flicker) and each plume draws a camera-facing column about its own axis, depth-tested
against the scene (what stands in front of the plume is not bent), that samples the copy at offsets
from the gradient of a refractive-index field rising with the gas (two octaves of value noise,
cells of a few millimetres climbing at ≈7–15 cells/s). Where the envelope is zero (the column's
edges) the copy returns texel for texel: no seam. The column starts at 0.85 of the flame (the tip
shimmers a little), is 6 flame radii wide and 4.5 rest lengths tall; its peak displacement is
1.2 CSS px (2–3 device px at the laptop size) × the flicker's gain × the flame's output × (1 −
turbulence)² (the breath blows the hot gas away). Over the smooth greige wall a candle's haze is
invisible, as in reality; it shows on what passes behind the plumes (the back piping, the back
candles and flames) and on the tips. **Off** under reduced motion and after `settle()` (its sources
register no strength: posters and stills never shimmer), and on the Low tier. Its program is
linked the first time a plume is drawn at all (the scene's warm frame under the poster), not on the
first frame it shimmers (`tests/browser/resilience.spec.ts`: no program links after ready).

## The flames' light (`models/birthdayFire.ts` `patchFlameLight`)

Still ≈1 cd per flame through three's own `RE_Direct` on the cake's own materials (chained after
the cake owner's patches), with the extended-source clamp E = I/(d² + a²); its intensity is the
volume's (`f.intensity × fl.intensity × sootFormed`), so it flickers with the flame (the v1.5
statistics: ±2 % at 11 Hz, swelling and calming). New:

- **Soft shadows.** Each flame's light is shadowed by **its own candle**: the flame stands a few
  millimetres over the wax, so the candle hides it from a disk round its foot, analytic (its radius
  r·(H + D)/H at depth D below the top, soft-edged by the flame's size, wider the further below the
  top, its centre opposite the flame's lean); and by the **top tier's rim** (a cylinder a little
  inside the buttercream wall, measured at 0.485–0.489 on the master): the tier's sides and the
  tier below no longer catch the flames' light through the cake. v1.5's light was brightest
  exactly round each candle's foot (the inverse square, no occluder). The other candles' shadows
  (spokes from each foot away from each other flame) were built and measured (an analytic
  capsule per candle per flame, 36 tests a fragment): 2.7 ms a frame at the laptop size, for a
  darkening of a few per cent (one flame of six, in a daylit room) that the real sizes do not
  show: dropped; `flame-light-alone-dark-room.png` shows what remains.
- **One BRDF evaluation for six flames.** Their diffuse irradiance is summed exactly (each through
  its shadows) and shaded once along their summed direction (v1.5: six `RE_Direct` calls on the
  frosting's sheen/clearcoat BRDF).
- **Wax glow.** A candle's top is lit from inside: its own flame's light, scattered through the wax,
  glows round its whole circumference, fading over ≈2.4 mm down the candle (`WAX_GLOW`, `WAX_MFP`),
  as in every macro of a burning candle; a candle's side gets no direct light from its own flame
  (its rim hides it).
- Measured in daylight: the six flames lift the top tier's red by ≈+10 % at its centre, nothing on
  the tiers' sides (v1.5: +16 %, mostly the wrong hotspots at the candles' feet).
