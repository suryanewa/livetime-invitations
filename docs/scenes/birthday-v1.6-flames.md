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
  - the **luminous zone is its own teardrop inside the flame's envelope**: its bottom rounded,
    starting just above the wick's tip, widest about a third of the way up it, the dark fuel-rich
    core pushing up into its centre; it closes over the core higher up. Limb brightening comes
    from the march itself (the line of sight runs longest through the shell at its sides). The
    first build's foot sat at the envelope's widest point: a flat-bottomed bullet ("tombstone",
    judge round 2) at the real sizes;
  - the wick stands in the dark zone below it, inside the blue cup, as in the macro photograph;
  - its outer sheet is crisp, the last fifth of its radius thinning exponentially and ≈430 K
    cooler: an **amber rim** whose colour ramp and cut are never narrower than ≈2 px (the 11 Hz
    flicker moves the edge by fractions of a pixel; a 1 px rim crawled: judge round 3);
  - **never under ≈1.1 px across**: a flame thinner than a pixel falls between the pixels'
    samples (at 192 px one of the six blinked out: judge round 3), so its radius is held at
    1.1 px with its light spread over the wider body (flux kept: emission × (R/R′)²);
  - the soot burns out before the profile closes: a **rounded orange apex** (≈380 K cooler);
    the just-formed soot at the luminous foot is ≈220 K cooler (orange);
  - the **blue sheath** is a thin shell (0.86–1.06 of the radius) under the luminous foot only,
    never added over the soot (blue + yellow drew a lilac seam), closed under the flame and ending
    above the volume's lower bound (no seam on the wick), saturated (green ≈0.45 of blue) and
    dim: about a tenth of v1.5's over the wall, faded out where its limb covers less than ≈2 px
    (at the showcase's sizes against the daylit wall it is all but invisible, as to a camera;
    v1.5's was a lavender bulb, the first v1.6 build's a pale "bowtie");
  - **turbulence**: value noise in the flame's own frame (millimetres), carried up the flame on
    the live clock, warps the field: a tenth of a millimetre at the tip in still air (a laminar
    candle flame is smooth), up to ≈2.5 mm in the breath's gust (`uNoise.y` follows the lean), and
    the soot loading varies by 6 % (30 % in the gust). A domain warp, so the luminous sheet stays
    a sheet.
- **Emission and colour.** Soot's Planck radiance (the v1.5 table, 700–2,300 K) × `FLAME_GAIN`
  1,900 on the rig's exposure (1.15): the body ≈5 on the exposed scale, the core ≈10–20, ≈10–20×
  the lit greige wall (a candle, ≈10⁴ cd/m², in a ≈2,500 lx room). The camera's response is a
  **per-channel shoulder x/(1 + x)** with **crosstalk growing with the luminance**
  (`FLAME_CROSSTALK` × y² reaches every channel, as a sensor's overlapping filters do at a high
  exposure): red rises first, then green, then blue, never two channels clipped together, so
  the body is yellow with red above green, the core cream, the rim amber, the apex orange.
  Measured on the 30× macro (`evidence/v1.6/flames/macro-z30-nobloom-z30-z60-z10.png`, no bloom):
  core (252, 247, 233), body (251, 240, 205) on the axis to (255, 223, 115) towards the limbs, the
  upper body (253, 204, 85), the apex (255, 228, 174), the rim (255, 224, 202) where it meets the
  wall. The v1.5 response (1 − e^−x) and the first v1.6 build clipped red
  and green together (a cold lemon body, a peach apex: judge rounds 1–2); three's Neutral tone
  mapping, hue-preserving, turns an overexposed blackbody salmon (v1.5's finding, re-checked).
- **Alpha.** Premultiplied over the scene (`One, OneMinusSrcAlpha`): a = 1 − Tr·(1 − lum)², soot's
  transmittance through the march times how much of the wall a highlight this bright leaves
  visible (a film's response to a bright emitter over a lit wall). The body holds its colour; the
  rim cuts the wall's blue to amber instead of washing to peach; the flame in front of the blue
  frosting stays warm (it went white-lavender with v1.5's `screen`); the faint outer sheet stays
  transparent (no dark ring). The absorption goes with the radiant output (a dying flame thins
  away, never a dark ghost: the first build drew the blown-off body as a brown smudge) and with
  the soot's own glow (the cooler soot at the luminous foot no longer darkens the wall to olive).
- **Dying flames** fade much faster than they cool (radiance × (1 − cool)³ on top of the
  intensity; soot's radiance falls about as T⁵ and its soot burns out): the blown-off body goes
  yellow → amber and thins, never a white blade.
- **The ember** goes through the same shoulder at a third of v1.5's gain (in the flame's glow
  and on the wick's emissive): orange at its flare, dull red as it cools, never a clipped yellow
  LED; it never blooms (it glows on into the decline, down into the bin, and the bloom pass is
  not depth-tested).

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
  sensor's **footprint floor** (v1.5's glare floor, now a bloom source): a warm (1, 0.62, 0.25)
  Gaussian of σ 1.1 CSS px at the luminous centroid, peak 26 × the flame's output, faded out as
  the flame grows past 18–60 px tall: on the 192 px thumbnail each flame gets a warm glow of up to
  +18 in red (on/off difference); at 9 it was +5 and the thumbnail read as white specks (judge
  round 2).
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
    with other lights made every lit material look its program up again on the next pass, ≈0.75 ms
    a frame, measured) but its shadow map is never drawn there.
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

## Stills, reduced motion, the clocks

- The flicker (`fire.ts` `flicker`) now carries its clock and gain (`Flicker.time`, `.gain`); the
  volume's turbulence rides that clock, the haze its gain. `settle()` (load, reduced motion,
  replay, the settle deadline; never a change of mind's cut) returns the live clock to 0 with the
  gain (already 0 there, so nothing jumps): every still flame is the same still (the posters, the
  reduced-motion poses), and the flicker fades back in from it over 0.35 s as before.
- Reduced motion: still flames, the volume at its clock's 0, no haze, the bloom on (the stills
  glow as the live scene does: the capture path is the live path).
- The Birthday guest-ready posters (vanilla, cocoa) and the collection thumbnail were recaptured
  (`pnpm capture birthday`); host-ready, accepted and declined have no flame and did not change
  (the capture rewrote them identically). The backdrops are stills of the empty stage: unchanged.

## Cost (M2 Pro, Chrome/Metal, each frame waited on with a 1-pixel readPixels)

Alternating 12-frame batches of each case (the GPU's clock wanders; interleaving cancels it),
medians of 50 batches, the lit guest-ready cake, live (flicker, haze). The machine was shared
with the other owners' servers and browsers, so the absolute frame times run ≈1.5–2 ms above the
quiet run's; the differences are what matter.

| | laptop 1280×720 @2× (2.5 MP) | phone 390×844 @2 (1.3 MP) |
|---|---|---|
| Whole lit frame | 8.5 ms (quiet run: 6.0) | 8.0 ms |
| Six flame volumes (32 steps; the march alone) | ≤ 0.1 ms | ≤ 0.1 ms |
| Bloom (emitter pass, 5 levels, composite) | 0.4–0.9 ms | 0.8–1.1 ms |
| Heat haze (one canvas copy + six columns) | 0.4–0.6 ms | 0.5–0.8 ms |
| The flames' light (shadowed, one BRDF) | 0.4–0.8 ms | 0.7 ms |
| All the fire's drawing together | 1.2 ms (volumes, bloom, haze) + 0.8 (light) | 1.6 + 0.7 ms |

- The brief's ≤ 1.5 ms for six flames: the volumes cost under 0.1 ms at both sizes (they are
  small on screen); volumes, bloom and haze together 1.2–1.6 ms.
- Built and rejected by measurement: the bloom drawn after the scene (its targets split the
  canvas's pass: +0.45 ms); the bloom pass with the scene's lights left out (three's per-scene
  light state changed every pass and every lit material looked its program up again: +0.75 ms);
  the candles' mutual shadows (36 capsule tests a fragment: +2.7 ms); six BRDF evaluations (one
  now).
- Off when not needed: no emitter showing (every other scene, the blown-out cake, the empty
  stage) costs one visibility walk over the emitters (six objects); the bloom's and the haze's
  targets are freed when nothing glows or shimmers (`tests/browser/collection.spec.ts`: 30 scene
  switches hold no more textures than the first visit).
- Every frame still well under the 16.8 ms p95; on a phone GPU (≈4–6× slower) the fire's share
  would be ≈5–10 ms; Normal's pixel-ratio step and the Low tier (3 levels, no haze) take it from
  there. Not measured on a phone (none attached to this machine).

## The adversarial pass (a hostile VFX supervisor, three rounds, frames only)

| | round 1 | round 2 | round 3 |
|---|---|---|---|
| Macro | 5 | 6 | 7 |
| Laptop | 6 | 6.5 | 7.5 ("signable: a warm gold teardrop with a cream core and a rounded foot") |
| Phone | 6 | 6.5 | 7.5 |
| 540 card | 6 | 7 | 7.5 |
| 192 thumbnail | 4 | 3 | 4 (fixed after: the sub-pixel dropout) |
| Motion (live) | 7 | 7 | 6.5 (rim crawl; fixed after: the 2 px ramp) |
| The blow (rendering) | 3 | 4 | 6 |
| The light | 6 | 6 | 6 |

What each round found and what changed: round 1 (a white blob with a salmon halo; a lilac collar
round the wick and the bright zone reaching below its tip; the blown-off body a white blade; haze
tearing the candles in the gust; a 1 px edge) → the cream core and amber rim, the domed foot
above the wick, the blue off the soot, dying flames fading, haze collapsing in the gust, the
ember out of the bloom. Round 2 (per-channel clipping: a lemon body and a peach apex; a white tab
over the frosting; no glow at 192; a flat-bottomed bullet; a pale blue "bowtie") → the x/(1 + x)
shoulder, the alpha from the flame's brightness, the luminous teardrop, the stronger footprint
floor, the dimmer, thresholded blue, the cubic fade of dying flames, the orange ember. Round 3
(the rim crawling in motion, one flame dropping out at 192, a lemon rim line, olive pixels at the
foot, a lavender seam) → the 2 px rim, the 1.1 px minimum radius, the cooler rim, the
glow-weighted absorption, the blue's 2 px threshold; measured after: the 192 flame that dropped
out reads (255, 253, 174); the frame-to-frame change round the live flames is the flicker's own
(identical with the haze on or off).

Its remaining tells, recorded, not fixed here:

- **The smoke** (the loudest tell left in the whole sequence, judge round 3: six white threads of
  constant width that hang for 1.5 s; cross-hatched white bands in the gust) is v1.5's
  (`docs/scenes/birthday-v1.5-fire.md`), and the brief keeps the smoke as it is. Its look (an
  absorbing, scattering medium, opacity falling with age and height, breaking up after 5–10 cm,
  blue-grey where unlit) is the obvious next pass; the steam owner's raymarched volume is the
  technique.
- **The wick's tip at macro** is the master's mesh with a flat cut end: a ball of light on a stick
  at 60×. A curled bead glowing on its outward side is a geometry change (the cake owner's master).
- **The blue cup in the dark**: the sheath is thresholded by its pixel size so the daylit product
  shows none; in a dark room (`flame-light-alone-dark-room.png`) it is gone too. Fading it by its
  contrast against what is behind would need the scene's colour (or depth) under the flame.
- **Cross-candle shadow spokes**: dropped for cost (above); invisible in daylight at every real
  size (judge rounds 2 and 3).
- **Soft depth fade** of a blown-off body passing behind a rosette: the occlusion is correct (judge
  round 3 retracted it); a 1–2 mm soft fade would need the scene's depth (the steam owner's depth
  target, once merged).

## Verification

- `pnpm typecheck`; `pnpm test` (see the report: 30 files); new `tests/flameRender.test.ts` (6):
  the volume's step budget and its twin (bloom layer only, the same uniforms), bloom and haze
  no-ops on a renderer nothing registered on (it throws on any use), a burning flame registers
  its glow and its haze only while live (none settled, under reduced motion; the volume's clock
  0), nothing once blown out (the twins hidden), the breath's turbulence and the box holding it,
  the light patch (one BRDF evaluation, the wax glow only on wax, the occluder uniforms bound),
  the scene posing every candle and the top tier as occluders. `tests/birthdayFire.test.ts`: the
  ember's colour bounds follow the new response (bright orange, never red and green clipped).
- `pnpm test:browser` (`BASE_URL=http://127.0.0.1:5602`): new `tests/browser/bloom.spec.ts` (3):
  Party host-ready and the stage-colour measurement byte-identical with the bloom on and off (no
  pass), Birthday's lit cake one pass and a different picture, its empty stage and the blown-out
  cake none, the haze live and never under reduced motion; `collection.spec.ts` (30 switches, no
  texture accumulates: the bloom's and the haze's targets are freed when unused, found by the
  suite); `posters.spec.ts` (the recaptured Birthday posters and thumbnail);
  `resilience.spec.ts` (no program links after ready: the twin, the bloom and the haze programs
  are linked in the warm frame).
- Looked at, against the references: the macro next to Sunderland's photograph and v1.5; the
  laptop, phone, 540 and 192 sizes; 60 fps strips through the real controller (lit, the blow, the
  2 s smoke hand-over); one flame through the blow every 32 ms; ignition and the snuff; the
  flames' light alone in a dark room; the haze off/on/difference; three bloom strengths.

## Evidence (`evidence/v1.6/flames/`)

`macro-sunderland-v15-v16.png`, `macro-z30-nobloom-z30-z60-z10.png`, `laptop-1280x720@2x.webp`,
`laptop-flames-x3.png`, `laptop-flames-v15-vs-v16-x3.png`, `phone-390x844@3x-frame.webp`,
`phone-flames-x3.png`, `still-540@1.webp`, `still-540@2.webp`, `still-720@1.webp`,
`thumbnail-192-x3-nearest.png`, `lit-60fps-strip-real-controller.png` (+ `.mp4`),
`blow-60fps-strip-real-controller.png`, `smoke-handover-60fps-strip-real-controller.png`,
`blow-2s-real-controller.mp4`, `blow-closeup-every-32ms.png`, `ignition-and-snuff-closeups.png`,
`flame-light-alone-dark-room.png`, `heat-haze-off-on-difference.png`,
`bloom-strengths-0.06-0.1-0.14.png`, `frame-cost.txt`.

## Smoke pass (v1.6, after the flames)

The owner's note above named v1.5's smoke as the loudest tell left. This pass changes only how the
smoke is drawn. Its physics is v1.5's and has not changed (`src/scenes/birthday/fire.ts` is the same as
at `2ff6bfd`): the hand-over at extinction, the rise speeds, the plume that runs laminar and then
wavers, the shared stir after the breath, the 3–5.5 s smoulder and the change-of-mind carry.

**What the smoke is now** (`src/render/flame.ts` `createSmokeMaterial`, `models/birthdayFire.ts`
`SmokeRig`):
- Each strand is still a camera-facing strip. It is shaded as a soft **thick tube**: Beer–Lambert
  optical depth from the physics' opacity, a soft chord across it, and premultiplied blending in
  display space.
- **Lighting** (`SMOKE_LIGHT`): single scattering of the rig's key, found per scene (the light that
  casts the shadow). It uses a Henyey–Greenstein phase with g = 0.3 and is self-shadowed along the
  light's path through the tube, so a thick stem's far side is darker. The room light, less what
  the column hides from itself, is added, at albedo 0.95. Under room light alone a thin wisp is
  about as bright as the wall. The key makes it brighter, so it reads over the cove, the frosting
  and the shaded plate.
- **Last glow** (`SMOKE_GLOW`, the `aHot` attribute): parcels that leave the wick in the first
  40 ms carry the soot's 1,500 K glow, which fades over 35 ms. A snuff passes on a quarter of it.
- **Heat haze**: the haze runs on into the plume from the cooling ember at 0.6 × its glow
  (`HAZE.plume`). It only runs while the scene is live (`flicker.gain`), never in stills.
- **Added in this pass, `547e22f`.** Where a thread turns back on itself on screen (the first
  vapour's head curling over in the gust), the strip now **pinches through the fold**: its width
  goes down by `smoothstep(-0.2, 0.8, cos turn)`. Before, it flung its corners out past the fold.
  The cross-section Gaussian is also lowered so that it reaches exactly 0 at the strip's edge
  (it used to leave 8 %).

**The hostile look.** All frames come from the real controller. The references were Wikimedia
Commons photographs, viewed beside the frames and not stored in the repo:
*"Candle with smoke".JPG* (Arivumathi, CC BY-SA 3.0: a candle just blown out in a room, against a
light wall), *Kerze -- 2021 -- 5491/5487/6000.jpg* (D. Rabich, CC BY-SA 4.0), *Candle smoke structure
1.jpg* (Tigerzeng, CC BY-SA 4.0) and *2017-365-91 Smoking Candle* (cogdogblog, CC0).
- *Fixed: hard-edged white tabs at every plume's head* in the gust (0.3–0.8 s), a few pixels
  wide at laptop size and plain at close-up. The obvious cause, the strip's cut-off head, was not
  it: the physics already ramps the head's opacity in over 25 ms. An attribute test (only the last
  8 parcels drawn, then all but them) showed that the tabs were folds: the head curls back (cusps
  in the dumped screen path), and the strip's corners spread out past the cusp. After the fix the
  large wedges are gone. Small soft knots remain where a fold doubles the density, which reads as
  a curl: `fold-tabs-before-after-3600px.png`, `laptop-plume-heads-before-after-x2.png`.
- *Hand-over: continuous.* Frame by frame at 16 ms, the blown-off body thins away, and within one
  frame a pale thread leaves the glowing ember (bare + 16–32 ms). It runs as one thread with no
  gap, as in the photographs. The 35 ms warm tint of the last glow cannot be seen at 60 fps
  (`handover-96-336ms-every-16ms-real-controller.png`).
- *Lit and soft:* the threads are soft-edged. They are a little brighter than the wall and a
  little cool (thin wax aerosol). There is no banding in the smoke: at 6× contrast the only bands
  are the wall's own 8-bit gradient. A cross-section of the densest fresh column, 20 px above the
  ember at 3,600 px, peaks at 226 over the wall's 210, and its peak sits off-centre towards the
  key. No dark core shows, because the threads are optically thin, as real candle smoke is
  against a lit wall.
- *Reads at laptop size:* yes. There are six threads, swept to the right by the breath, then
  rising (`laptop-1280x720@2x-smoke-0.52s.webp`, `-1.72s.webp`).
- *Accepted still:* no smoke. On the reduced-motion accepted still, the largest lift above the
  cake is 4 levels (the wall's gradient). Against the committed `vanilla-accepted.webp` the mean
  absolute difference is 1.0 (WebP). The live pose 8 s after Accept is clean.

**Gaps (recorded, not fixed here):**
- **Threads that look like tubes, 1–3 s.** From 1 s to 3 s six white threads of near-constant
  width stand straight up to the top of the frame and fade by about 3.5 s. Two things cause this,
  and both belong to the physics, which this pass keeps: `SMOKE.maxWidth` caps the drawn width at
  4 mm, and the age fade is [1.2, 2.5] s. In the light-wall photograph the smoke is a faint grey
  veil after about 10 cm, with folded sheets that are bright where seen edge-on. A strip cannot
  draw a sheet seen face-on; a ribbon drawn wider folds into hard planes, which is why v1.5 capped
  it. The technique that fixes it is the steam owner's raymarched density volume, applied to the
  plume (after integration). A rendering stopgap would be stronger breakup or thinning with height
  in the shader; it was not tried, because it changes how long the smoke reads, which the physics
  sets.
- **Residual slivers** of 1–2 px at very high magnification (20× the hero frame), where a fold
  falls between two parcels. They cannot be seen at the real sizes or at 3,600 px.
- **The smoke over the light wall is brighter than in the photograph.** This was chosen for
  legibility: v1.5's judge found smoke matched to the wall vanished.
- **Not done in this pass:** frame cost and the browser suites. The coordinator stopped them
  because the shared machine was under load (load average 9–26). Only `pnpm typecheck` was run
  last, and it passes. Before this pass's commit, the unit files passed on `547e22f`:
  `birthdayFire` 28/28, `flameRender` 6/6, `birthday` 33/33. `birthday.spec` was cut off twice:
  once by a dev server that had died, then by the 3-minute limit. `bloom.spec` and the smoke's
  on/off frame cost (budget ≤ 1.0 ms) are left for integration. The shader adds a few ALU per
  vertex: 1,152 vertices and two dot products. The fragment cost is the same as before.

**Evidence** (`evidence/v1.6/flames/smoke/`): `blow-smoke-0-4s-every-128ms-real-controller.png` and
`handover-96-336ms-every-16ms-real-controller.png` (both from the full 0–4 s strip, captured at
62.5 fps through `controller.captureStill(540, 2)` on a fake clock);
`close-centre-candle-plus-0.3s-after-extinction.png`, `close-centre-candle-plus-1.5s-after-extinction.png`
(`captureStill(1200, 3)` crops); `fold-tabs-before-after-3600px.png`,
`laptop-plume-heads-before-after-x2.png`; `laptop-1280x720@2x-lit.webp`, `-smoke-0.52s.webp`,
`-smoke-1.72s.webp`, `-accepted-8s.webp`; `accepted-still-reduced-motion-540@2.png`.

## Polish round: the judge's fixes (v1.6 polish, branch `v1.6/flames-polish`)

The independent VFX judge would not sign the first build (flame at rest 5–6, flicker 4, blow 5, smoke
after 1 s 3, light 3.5, macro 5) and ranked nine tells. This round takes its five demanded fixes in
its order, then the light; every number below is measured on rendered frames through the real
controller (the judge's own scripts: the size series, the 1 s lit strips, the 30× macro with the
bloom on and off, the blow strips, the smoke sheet 0.3–3.9 s, the light on/off difference).
Evidence: `evidence/v1.6/flames-polish/`.

### 1. The smoke as a volume (`models/birthdaySmoke.ts`, new)

Tell 1 (critical: "six strings") and tell 6 (the first smoke too weak).

- **Source.** The strand physics (`fire.ts` `smokeStrand`) is unchanged as the source and now also
  reports each parcel's vapour (`rate`: the wick's emission at its birth × the breath's dilution, 0
  where none is seen), its rise and its own width. The ribbons draw only a thread's laminar stem,
  its first 2.5 cm of path, handing the vapour to the volume by 5 cm (`SMOKE_VOLUME.ribbon`).
- **Splat.** Every frame the parcels are resampled into Gaussian puffs 1.2 σ apart, each carrying
  the vapour emitted between its parcels (mass conserved: the plume thins as it widens, it does not
  fade), and drawn additively into a 5 mm grid over the top tier: at most 80 × 96 × 64 voxels
  (40 × 48 × 32 cm), its z slices tiled in one single-channel half-float atlas (640 × 768), the box
  placed each frame round what is showing and snapped to the voxel lattice (nothing swims).
  ≈1,000–2,000 puffs; instanced quads, one per puff and slice it reaches.
- **Light volume** (half the grid a side, one pass): optical depth to the key (8 taps, 12 cm), to
  the room above (4 taps), and a dilated occupancy for empty-space skipping.
- **March** (the steam's technique, `models/dinnerSteam.ts`): a client of the stage's scene depth;
  half resolution (≤ 400 k pixels); 12 probes of the occupancy find the occupied span, 40 jittered
  steps march it (24 on Low), up to the opaque scene's depth; the composite is the steam's 4 × 4
  depth-aware upsample, tone mapped like the scene, premultiplied. Motion: laminar to 3–4 cm; a
  meander from 3–9 cm up (wavelength 6–10 cm, envelope ±1.2 cm at 10 cm, ±2.4 cm at 20 cm) and
  folds from 4–8 cm (1.4 cm growing to 2.8 cm, just past folding over), both carried up with the
  gas; ridged-noise sheets (denser on a carried level set, emptier between: edge-on folds read
  brighter). Width: the sheet's own thickness 2.5 mm + 7 % of the height (1 cm at 10 cm), the plume
  ≈1–2 cm wide at 10 cm and 3–5 cm at 20 cm with the warp. Plumes merge: 0.6 of their offset from
  the candles' centre by 20 cm, from 4 cm (v1.5: 0.55 from 5 cm over 20 cm). The aerosol evaporates
  as it mixes (e-folding 9 cm above 4 cm) and the volume's age fade is 1.4 × the ribbon's.
- **Shading.** Single scattering of the key, Henyey–Greenstein g 0.6 (forward: front-lit smoke is
  faint), albedo 0.92, self-shadowed through the light volume; Wrenninge's two octaves only where
  the smoke is optically thick (weighted 1 − e^−τ: thin smoke is single-scattering); the room's light
  occluded from above, a little blue-grey. (A sign error in the first phase function lit it as if
  back-lit, ≈2× too bright: fixed.)
- **The first puff** (`SMOKE.puff`, `puffWidth`, `puffFor`): the burst carries 1.8 × the vapour and
  leaves the wick 3.4 × as wide, narrowing over 0.45 s (≈4 mm for the first 0.2–0.5 s), without
  thinning its optical depth for the width (more vapour, not more air); the stem thins as the wick
  cools (width0 × 0.55–1 with the rate).
- **Measured** (540 @2, luminance over the wall's row median): the stems are 1–2 px threads for
  3–5 cm, then wavering sheets that merge; 20–30 cm up the veil lifts the wall by ≈5 levels at
  2.4 s (the first build's threads: 15–30), i.e. barely visible, as in *Candle with smoke*; the first
  puff (0.4–0.8 s) is the densest smoke of the sequence. Frame-to-frame (60 fps, 2× close-up):
  mean change 0.25/255, max 7: no shimmer.
- **Depth.** Only the candles occlude smoke rising above the wicks; they draw in the depth pass as
  their shadow stand-ins (2 k triangles each; the tooling cake without stand-ins: the candles
  themselves). Two fixes the volume needed in shared code: the scene-depth pass now lets the
  scene's lights take part with the shadow map suspended (a pass without them bumped three's
  light-state version, and every lit material re-validated its program in the main pass: +0.5 ms
  whenever a depth client was active, Dinner's steam included); the bloom moved to layer 29 (the
  depth pass's layer is 30: the cake would have bloomed).
- **Cost** (laptop / phone): 0.63 / 0.57 ms at 1.5 s (march 0.22, splat and light 0.07, depth pass
  and composite 0.33), 0.24 / 0.25 ms at the hand-over. No program links at the blow (its passes,
  and its 64³ noise, link in the warm frames under the poster: `showForCompile`).

### 2. The flame sits on its wick

Tell 2 (severe: "a flame on a stick") and tell 7 (macro).

- A burning wick shows **3 mm** over its pool (`WICK_EXPOSED`; the wick's own material squashes the
  master's 4.2 mm, so the GLB is unchanged); the flame is **15.5 mm** from its cup (0.8 mm over the
  pool) to its tip, ±12 % per candle (stratified: 0.90–1.10).
- The luminous zone's foot is **1.2 mm under the wick's tip** (it wraps the curled tip) and the
  flame is widest 1 mm over it, both held where they are on the wick whatever the flame's length
  (`uFoot`, `uWidest`). Bare wick under the luminous zone: 1.8 mm of a 16.3 mm flame (0.11; the
  judge measured ≈0.7 on the first build).
- The curled tip ends in a **charred bead** (≈1.1 mm) glowing orange-red: the lit ember is ≈1,240 K
  (`EMBER.lit` 0.8; v1.5's 1,030 K was black).
- The **blue cup** is one thin continuous shell, closed under the flame and joined to the luminous
  foot, and the camera sees it only where no soot glows on the same line of sight (blue over orange
  drew the pink-lilac foot). Against the blue frosting it is, correctly, all but invisible.
- **Framing held.** The hero fit and `FLAME_TOP` keep v1.5's flame envelope (`FLAME_FRAME`), so the
  camera, every Birthday poster's framing and the backdrops stay where they are; the drawn flame
  reaches 2–4 mm higher, inside the frame's margin.

### 3. Colour and bloom

Tell 3 (severe: "lemon-and-white stickers, all six identical").

- **Response.** The camera's per-channel shoulder is a sensor's 1 − e^−x (it was x / (1 + x), which
  compressed every channel towards lemon-cream), and the body is exposed lower (`FLAME_GAIN`
  1,900 → 700): red saturates while green is still ≈0.6 linear. A **hot core** low in the luminous
  zone (+150 K, × 2.2 soot) is the only part that clips white through the crosstalk.
- **Coverage** follows the brightest channel, so the light wall no longer washes the tip to peach
  and the blue frosting no longer turns the rim lavender.
- **Measured.** Macro (22×, bloom on = off on the body): white core 46 % of the width at its widest,
  in the lower third; body G/R 0.83–0.88; upper flame and tip 0.61–0.67 (the last 8 % fades to
  peach over the wall). Laptop: body G/R median 0.79–0.83 (first build 0.95–0.97); white 6–14 % of a
  flame's pixels; flames 15–20 px tall (10–12).
- **Bloom.** Amber (luminance × (1.55, 0.9, 0.38)); kept off the emitters' own pixels (the twin
  writes its radiance, without the small-size footprint floor, into the bloom source's alpha); two
  lobes by per-level upsample weights (`BLOOM.lobes`: a tight core, a faint veil reaching ≈2–4 % of a
  laptop canvas; 6 levels on Normal/High, +0.03 ms over 5; 3 on Low). Laptop on/off: +4/+2/+1 mean
  round the flames, nothing on them. 192 px thumbnail: +18 red (the footprint floor 26 → 36).
- **Per candle:** ±12 % length (above) and a 2–4° rest lean of its own (`restLean`, stills too).

### 4. Motion (`fire.ts` `flicker`: a change to the v1.5 flicker statistics)

Tell 4 (severe in motion). The research behind the change: the regular 10–12 Hz "puffing" of candle
flames is the collective oscillation of three or more flames bundled together (Kitahata et al., J.
Phys. Chem. A 2009; Okamoto et al., Sci. Rep. 6:36145, 2016); a lone birthday-candle flame in still
room air is steady and lives by the room's air. So: no coherent buzz; per candle a 1/f sway (six
partials 0.31–2.4 Hz ±15 %, amplitude ∝ f^−½, RMS 2° per plan component) and length breathing
(0.33–3.1 Hz, RMS 3.2 %, ±9 % at most); the shared room draft (±1°, 0.1–0.3 Hz); flutters of
100–300 ms (8–12 Hz, ±4°, ±7 %, the varicose wave only then) on one candle at a time every 3–4 s (none
overlapping in 600 s). The room's lean bends the flame from its base (55 % axis tilt, 45 % tip
bend). Measured: laptop tip sideways 0.35–1.7 px over 1 s (first build < 0.3 px); 30× close-up:
no 10.9 Hz peak (area spectrum 1–4 Hz), centroid sd 1.96 px (0.58), white-area variation 6.7 %
(2.8 %). The flicker test now asserts these statistics.

### 5. The blow

Tell 5 (high: "a rigid tilt, then a yellow leaf drifts away").

- The flame bends from its base (55 % of the breath's lean curves the axis downstream) and is drawn
  out: length × 1.58 at lift-off (up to × 1.68), width × 0.58 (down to × 0.51).
- Off the wick its luminous zone tears into one or two tongues (elongated noise cells carried along
  it, the base first) and its output is under 2 % within **44 ms** of lift-off (`BREATH.tear` 60 ms;
  never faster than 0.044 per ms, the scene's continuity bound); the lifted base is a dim blue sheet
  (× 0.7, fading) that goes out with the extinction wave; the blow-off carry is 0.12 (no intact
  teardrop drifting). The first vapour's last glow is halved (it drew a salmon puff).
- Kept: lift times, the extinction wave (`extinguishedAt`), the smoke's hand-over, the change of
  mind's carry, lit time → melt.

### 6. The light

Tell 8 (medium: "the light is not felt"). Calibrated by rendering against photometry (six ≈1 cd
flames ≈4.5 cm over the frosting: ≈900 lx, +30–35 % of a ≈2,500 lx room): the rig gave +12 %
(linear red, the group view with the flames' light on and off); now × 2.0: **+24.5 %** at the top
tier's centre, +19 % over it, warm pools between the candles round each one's own shadow disk, warm
inner sides on the rim rosettes, glowing candle tops. On the blue frosting warm light reads a little
lavender, so the lower half of the judge's +20–30 % was chosen. Same shader: no cost.

### Tells: gone and remaining

Gone: 1 (strings: stems, wavering sheets, a merging veil), 2 (flame on a stick), 3 (lemon stickers;
clipped core 46 %, golden body, orange tip, amber glare), 4 (the buzz; sideways ≥ 0.5 px), 5 (rigid
tilt and drifting leaf), 6 (weak first smoke), 8 (light not felt). Mostly gone: 7 (macro: the
wrapping foot, bead and continuous cup are in; the luminous zone's lower part is translucent over
the frosting, as a real flame is against a lit background). Unchanged: 9 (192 px: warm dots, the
glow restored to +18). Remaining, recorded: the smoke at close-up (2× the hero) is softer than a
real filament (5 mm voxels: the sheets' edges are a few millimetres soft); its six stems still start
evenly spaced (they are the candles); the heat haze is unchanged and still all but invisible over
the daylit wall (not a tell).

### Cost (M2 Pro, Chrome/Metal; `evidence/v1.6/flames-polish/frame-cost.txt`)

The whole fire (six flames, bloom, haze, smoke): lit 1.59 ms laptop / 1.58 ms phone; at the
hand-over 1.49 / 1.45 ms; at 1 s 1.00 ms laptop. Budget ≤ 2.5 ms: met at both sizes.

### Verification

`pnpm typecheck`; `pnpm vitest run`: 32 files, 441 tests (new: the blow, the smoke volume; rewritten
to the new statistics: the flicker, the flame's size and zones, the hero envelope). Browser
(`BASE_URL=http://127.0.0.1:5607`): `birthday.spec` 7/7, `bloom.spec` 3/3, `scene-depth.spec` 5/5
(Birthday now draws the depth pass while its smoke rises, none while lit), `resilience.spec`
(program links) 2/2, `collection.spec` (30 switches) 1/1, `posters.spec` Birthday 1/1 after the
recapture (`pnpm capture birthday`: the lit posters show the new flames; the others re-encoded).
No program links during the blow. Reduced motion: still flames when lit, no smoke on the accepted
still.

### Evidence (`evidence/v1.6/flames-polish/`)

`1-smoke-wide-sheet-0.3-3.9s.webp`, `1-smoke-hero-540x2-0.6-1.0-1.6-2.4-3.4-4.4s.webp`,
`2-flame-on-wick-macro-before-after.png`, `3-colour-bloom-sizes-before-after.png`,
`4-lit-group-0.5s-every-48ms.png`, `4-motion-stats.txt`, `5-blow-one-0-352ms-every-16ms.png`,
`5-blow-closeup-z25-64-176ms.png`, `5-blow-group-0-384ms-every-32ms.png`,
`6-light-off-on-relative-x4.png`, `frame-cost.txt`, `reduced-motion-guest-accepted-540x2.png`.

## Polish round 2: the re-judge's fixes (v1.6 polish 2, branch `v1.6/flames-polish2`)

The re-judge signed the flame at rest at phone and 540 (7/10) and the blow at laptop and phone, but
not the whole, and named five fixes: the smoke from 1 to 4 s (the blocker: six evenly spaced parallel
bright stems, then out-of-focus columns), the first puff (barely there; a salmon tint and a fan of
hairlines), the flame's foot (an orange collar on a glowing orange bead; a pale blue glass bubble),
the lift-off (a golden sliver with a white core drifting for 2–3 frames) and the light (it turned the
top tier lilac and swapped it back all at once). Each fix is its own commit, measured with the
re-judge's own scripts on frames through the real controller. Numbers: `evidence/v1.6/flames-polish2/measurements.txt`.
`v1.6/integration` (the cake polish 2's light response) was merged in before fix 5, so the light is
calibrated against the pool that ships.

### 1. The smoke from 1 to 4 s (`fire.ts`, `models/birthdaySmoke.ts`, `models/birthdayFire.ts` `SmokeRig`)

- **Stems of their own.** Each plume's laminar stem ends at its own height (`smokeLaminar`: 4–12 cm,
  stratified in a seeded order: 4.2, 7.4, 11.4, 9.9, 5.9, 8.5 cm) and leans its own way (`smokeLean`:
  3–8°, alternate sides across the picture, on top of the room's shared draft). The six no longer run
  parallel, nor end together.
- **Filaments above them.** Above its transition the thread's waves go on growing (× up to 2.6 over
  7 cm) until they roll into curls; five strands (was three) split off at staggered heights. The
  strips draw the stem *and* the thin filament it goes on as (`ribbonShare`): at the thread's own width
  (1–3 mm, `full`), as dense as the smoke it still carries (the opacity the physics thinned for the
  turbulent spread is given back, × (spread/full)^0.6), fading out 6–24 cm over the transition; the
  volume draws the rest, so the mass is kept. The breath's sweep hands smoke to the volume only for
  vapour born while it blew (a filament's own curls make its path longer than its rise). The strips
  go through a Catmull–Rom midpoint between parcels (`SMOKE_RIBBON_POINTS`: curls are round).
- **Sheets inside the grid.** The parcels carry their turbulence into a second channel of the density
  atlas (0 on a stem, 1 folded); the light pass averages it over 1.25 cm, and the march folds the
  developed smoke into sheets: the zero set of an advected noise (cells ≈0.8 cm growing with height,
  ε thin), its profile integrated exactly over each step (erf of the linearised field: a thin sheet is
  never missed nor stippled), a tenth of the smoke left as a veil; dense developing smoke billows
  instead (below). A white-noise start replaces interleaved gradient noise (its diagonal showed as
  hatching against thin sheets); the box keeps a 1.5 cm margin for the warp.
- **Measured** (2× close-up, ≈3.4 px/mm): crisp lines per plume (≥ 6 levels over the wall, half-width
  ≤ 4 px, running ≥ 1 cm, in each plume's zone 1–15 cm over its own stem) 2.3 / 5.2 / 4.3 / 3.0 / 3.3 /
  2.5 at 1.1 / 1.6 / 2.0 / 2.5 / 3.0 / 3.5 s, median +10–17 levels, half-width 3.0–3.4 px (the
  re-judge's frame at 2 s: none; its columns were 10–15 px soft). Curls show at laptop size from 1 s.
  The plume's path is computed once a candle and shared by its strands: 0.76 ms a frame of physics for
  5 × 96 parcels (v1.6/integration: 1.32 ms for 3 × 64).

### 2. The first puff

- The breath's burst of vapour is 12× the smoulder's rate at once, e-folding in 0.2 s (`SMOKE.puff`,
  `burst`: the vapour the flame was burning, all condensing now); the breath's shear layer rolls it up
  (`rollPuff`: the burst's parcels wind about their centroid in the flow's plane, faster nearer it);
  the volume draws it (the strips draw threads only: no strip wider than 3.5–5 mm, nor the puff's head:
  a wide strip drew the hairline fan and a marshmallow at the wick), with billows where the developing
  smoke is dense (Worley lumps through the folds) and an octave of the room's light for thick smoke
  (`roomOctaves`: a dense puff is whiter than the greige wall; single scattering capped it at +20).
  The splat's Gaussian reaches 0 at its cut (its 4 % drew hard edges round the dense puff).
- The last glow 0.4 → 0.06 (`SMOKE_GLOW`): no salmon puff.
- **Measured** (group view, over the pre-blow frame): the puff's core +20–24 levels at 0.24 s, +25–33
  at 0.32 s, +23–29 at 0.40 s; its red over its green −7 to −10 levels at 0.16–0.19 s.

### 3. The flame's foot (`FLAME.foot`, `src/render/flame.ts`)

- The luminous zone's foot is 0.4 mm over the wick's tip (was 1.2 mm under), its soot forming within
  0.5 mm (`FLAME_FOOT.ramp`), its rounded bottom 0.22 of the zone (was 0.32: a 4 mm bowl whose light
  rose through the camera's orange), the dark core closed within 2.5 mm (held open over the lower
  half, that part's light came from the cooler shell alone), 60 K cooler at the foot (was 220 K). The
  lowest ≈18 % of the flame is its dim blue zone; the white-yellow core starts 1–1.5 mm over the tip.
- The bead: 0.6 mm, lumpy (was a 1.1 mm sphere); the lit ember ≈1,130 K (was 1,240 K: a fifth as
  bright), its glow σ 0.3 mm (was 0.5).
- The blue sheath is added after the camera's response, deep blue, as light only, at most +3 levels
  (`FLAME_BLUE`); through the soot's alpha and the response it drew whitish-blue arcs.
- **Measured.** 30×, the share of saturated orange in the bright part's lowest 5–10 / 10–15 / 15–20 %:
  23 / 10 / 21 % (re-judge: 5 / 50 / 71 %, and 51 % at 20–25 %); the lowest 5 % is the thin amber rim.
  Laptop, each flame's lowest 20 %: orange 40–52 % → 10–19 %. The blue cup, A/B: +3 B, +2 G, +1–2 R
  at most.

### 4. The lift-off (`fire.ts` `flameState`, the shader's fade)

Off the wick the soot cools over 26 ms (`BREATH.cool`, the fastest C¹ ramp the scene's continuity
tests allow) and the shader draws a cooling flame × (1 − cool)^5 (was ³): 23 % of its light 8 ms after
lift-off, 4.6 % at 12 ms, 0.3 % at 16 ms. The luminous zone tears over 45 ms (was 60); its radiant
output (its light, the melt) ramps with the tear alone. Close-up: the frame 5 ms after lift-off
carries 2.6 % of the flame's light (peak +9 levels, orange, no white core); 21 ms after, none.

### 5. The light (`models/birthdayFire.ts`)

- **Colour.** Soot at 1,900 K through the camera's white balance part-way to the candles (2,200 K)
  with 30 % of the room's white (`FLAME_LIGHT_WB`): (1, 0.84, 0.45) linear (was (1, 0.28, 0.01): deep
  orange to a daylight camera, lilac over the blue frosting). The wax under its own flame glows
  halfway back to the soot's colour (`waxGlowColor`).
- **Breathing.** × (1 + 0.65 × the flame's length breathing + 3.5 % × the room's air at 0.6–2.3 Hz,
  shared) (`FLICKER.light`, `Flicker.light`); exactly 1 in stills.
- **The blow.** Each candle's light goes out with its own flame over 45 ms from its own lift-off.
- **Measured** (the group view, the flames' light on and off, with the cake polish 2's pool): the
  top's centre +6.0 R / +5.0 G / +1.3 B levels (linear +8.7 / +6.0 / +1.2 %; re-judge +51 / +19 / 0
  on the first pool, +8 / +2.5 / 0 on the calibrated one); round the candles +9–11 R with G and B.
  Over 1 s the centre's light varies sd 1.4 %, p-p 4.7 % (round the candles sd 1.2–2.4 %). Through the
  blow the top's mean (+12.6 R) falls over 112–272 ms, at most 1.5 levels a frame, the left candles'
  pools first (128–176 ms), the right's last (208–256 ms).

### Tells

Gone: the six parallel stems, the out-of-focus columns, the weak first puff, the salmon puff, the
hairline fan, the orange collar, the match-head bead, the pale blue bubble, the golden sliver, the
lilac top and its swap. Improved: the 192 px dots (the collar and bead gone; the warm footprint glow
kept so the thumbnail reads lit). Remaining, recorded: at 2× the filaments' sharpest turns (rolls seen
edge-on) are corners with a bright point where the strip doubles back; the first puff at 10× is a
soft, rolled cloud (the volume's 5 mm grid) rather than a crisp one; the macro's wick is still the
master's matte rod (tell 9); the vector-like constant-width rim at 12–60× and the march's stipple at
12× (tells 7–8) are unchanged.

### Cost (`evidence/v1.6/flames-polish2/frame-cost.txt`)

The whole fire (flames, bloom, haze, smoke): lit 1.21 ms laptop / 1.17 ms phone; the first puff
(0.3 s) 1.00 / 0.86 ms; the smoke at 1.5 s 0.81 / 0.75 ms (+0.76 ms of physics on the main thread).
Budget ≤ 2.0 ms: met.

### Verification

`pnpm typecheck`; `tests/birthdayFire.test.ts` 35/35 (new: the stems' heights and leans, the strip /
volume split, the strands sharing their plume, the lift-off's seen fraction, the light's colour,
breathing and per-candle fade; the foot's position), `tests/flameRender.test.ts` 7/7,
`tests/birthday.test.ts` 34/34 (the continuity bound on the faster lift-off), `birthdayChange` 7/7,
`birthdayMeltCarry` 2/2, `scene-depth` 5/5, `birthdayPiping` 9/9. Browser (`BASE_URL=http://127.0.0.1:5610`):
`birthday.spec` 7/7, `bloom.spec` 3/3 (one failure on a cold first run, 3/3 on the two full runs after),
`scene-depth.spec` 5/5, `resilience.spec` 14/14, `collection.spec` 3/3, `posters.spec` Birthday 1/1 after
the recapture (`pnpm capture birthday`: every Birthday poster and the thumbnail; the host-ready and
accepted ones also carry the merged cake polish 2). The re-judge's kept qualities, re-measured: the
lit 1 s strip's tip-x sd 0.95–2.10 px, dominant 1–2 Hz, area correlation −0.01; the bloom's
byte-identical guard; the accepted still at 8 s and under reduced motion shows no smoke.

### Evidence (`evidence/v1.6/flames-polish2/`)

`1-smoke-2x-closeup-1-3s-before-after.webp`, `1-smoke-wide-sheet-0.3-3.9s.webp`,
`1-2-smoke-laptop-0.4-3.5s.webp`, `1-2-smoke-phone-0.3-2.5s.webp`, `2-first-puff-group-160-480ms.webp`,
`2-4-blow-closeup-128-400ms.webp`, `3-foot-macro-30x-60x-12x-before-after.webp`,
`3-foot-macro-30x-nobloom-and-f3.webp`, `3-sizes-laptop-540-192-before-after.webp`,
`4-blow-closeup-0-400ms-every-16ms.webp`, `5-light-off-before-after.webp`,
`5-light-alone-x4-before-after.webp`, `5-light-through-the-blow-0-304ms.webp`,
`lit-group-1s-every-128ms.webp`, `accepted-4s-8s-reduced-motion-540x2.webp`, `frame-cost.txt`,
`measurements.txt`, `light-measurements.txt`.

## Polish round 3: the third judge's fixes (v1.6 polish 3, branch `v1.6/flames-polish3`)

The third judge signed the flame at rest (7.5 at laptop, phone and 540), the blow at laptop and phone (7)
and the smoke's first 0.3–0.8 s (7), but not the flames as a whole, and named three fixes and an optional
fourth: a white "marshmallow" at each wick after the flame goes out (new in polish 2), the smoke filaments
reading as wire, the flame hovering over its wick at 30×, and the lift-off's brushed foot and last sliver
frame; optionally the light's halo peaking at each candle's own base. Each fix is its own commit, measured
with the judge's own scripts on frames through the real controller. Numbers:
`evidence/v1.6/flames-polish3/measurements.txt`.

### 1. No marshmallow at the wick (`fire.ts`, the ribbon's lighting in `flame.ts`)

The static rounded capsule (5 × 10 mm, +15–20 levels, 160–300 ms) was the ribbon: it drew the wick's stream
3.15–3.4 mm wide (the puff's head, × 3.4 at birth for 0.45 s) and nearly opaque, carried end-on by the
dying breath, and half the burst's vapour rose after the breath had passed.

- **The burst leaves with the breath.** It e-folds in 0.08 s (was 0.2; `SMOKE.puff` 12 → 30, the same
  vapour): the wick stops boiling off the flame's fuel as soon as the flame's heat leaves it. Share of the
  wick's vapour given off while the breath is ≥ 0.4 m/s at the wick: 35–40 % → 58–62 %.
- **A thread at the wick.** The puff's head widens as it leaves, over its first 60 ms of age, as far as the
  breath it met rolls it (`puffMet`, `puffGrow`, `puffFor` 0.25 s): every thread is the ember's own
  ≈ 1 mm at the wick (1.0–1.13 mm at 160–300 ms).
- **The stream flaps.** The jet's eddies sweep past the wick at 9–16 Hz: each parcel leaves on the gust
  it met and keeps that heading (`SMOKE.flap`: at most 5 mm, faded where the parcels are too far apart in
  birth to draw the wave), so the streak's waves run off with the flow; once a candle, its strands one
  thread at the wick.
- **Dynamics and continuity.** The plume's rise, transition and waves follow the emission rate up to the
  old burst's peak (`SMOKE.qDynamics` 6: the shorter, denser burst is the same hot gas). The breath's roll
  winds the burst's smooth path and turns each parcel's own waves rigidly with it (wound from the waved
  positions, a spiral turned 8 rad multiplied the 10 Hz waves into 3 mm jumps between milliseconds).
  Largest move between 1 ms samples: 0.9–1.4 mm.
- **Dense ribbons scatter on** (`createSmokeMaterial`): where a thread is optically thick its light is
  the volume's octaves (× 1 − e^−τ), so the dense jet at the ember is grey-white, not a grey rod.
- **Measured.** The capsule is gone at 10× and in the group view: a 1 mm jet leaves the ember and widens
  into the puff, its angle swinging up as the breath decays. The first puff is kept (group view, clean
  wicks): +22.7 at 0.16 s, +23–27 at 0.19 s, +24–46 at 0.22–0.29 s (judge: +16, +20–31, +25–34), R−G −6
  to −7.

### 2. The smoke from 1 to 4 s: filaments widen into veils, no knots (`birthdaySmoke.ts`, `SmokeRig`, `flame.ts`)

- **Widening.** A filament widens linearly with its height over the wick from 5 cm, by 30 mm per m
  (`SMOKE_VOLUME.filamentWiden`, `filamentWidth`), and thins as it widens (the same smoke over the width).
  It is a folded sheet: along it, stretches turn edge-on (a crisper line, a fifth of the widening) and
  face-on every few centimetres (`filamentFace`, the pattern carried up with the smoke), all face-on
  12 cm over its stem's end (`filamentFace` 0.12 m): face-on veils as it fades.
- **Knots.** Where a thread runs towards the lens its strip's quads piled onto one spot, through a fold its
  two legs overlapped, and where it turned on screen tighter than its own half-width its inner edge folded
  over and the quads fanned into a star: the strip's smoke is drawn once there (× 0.3 end-on, × 0.5 through
  a reversal, × 0.6 in a tight turn) and the strip narrowed to the turn's radius.
- **Measured** (2× close-up, the median half-width of the peaks by height over the wick):

  | | 0–4 cm | 4–8 | 8–12 | 12–16 | 16–20 cm |
  |---|---|---|---|---|---|
  | judge, 1.97 s | 0.69 | 0.81 | 0.96 | 1.19 | 1.09 mm |
  | now, 1.97 s | 0.67 | 0.88 | 1.42 | 2.26 | 2.96 mm |
  | judge, 2.99 s | 0.66 | 0.78 | 1.00 | 1.09 | 1.11 mm |
  | now, 2.99 s | 0.67 | 0.84 | 1.44 | 2.10 | 2.62 mm |

  Peak brightness at 16–20 cm +7.8 → +4.9 levels (density falling with width). Knots over their filament:
  judge +24 and +12 at 1.97 s → none over +6 at any of 1.07–3.50 s. At laptop and 540 @2 the threads soften
  into wisps over ≈ 8 cm (the judge's white wire); the accepted still at 8 s has no smoke.
- **Traded.** The second judge's crisp-line count (lines ≤ 1.2 mm half-width over 1–15 cm above each stem)
  falls from 2.3–4.3 to 0.2–0.8 a plume: above the stems the filaments now widen, as this judge asked; the
  stems and the first centimetres over them stay lines.

### 3. The wick inside the flame (`FLAME.foot`, `FLAME_FOOT.ramp`, the flame's wick occluder)

- The luminous zone's foot is 0.8 mm **under** the wick's tip (polish 2: 0.4 mm over it), its soot forming
  dim over ≈ 1.7 mm (`FLAME_FOOT.ramp` 0.11, was 0.03): the wick is seen through the flame's dim lower
  zone, its curled tip glowing at the edge, and the golden body starts ≈ 1 mm over the tip (polish 1's
  1.2 mm under, its soot formed at once, drew the orange collar).
- The flame's wick occluder follows the curl: two capsules through a point 1.2 mm under the tip (the curl
  is a cube of the height up the braid), the upper one inside the tapered tip; the straight capsule from
  the foot to the curled tip left the background showing through the flame beside the tip once the
  luminous zone wrapped it (a pale crescent).
- **Measured** (30×, bloom off). Flame 3: from a 0.77 mm gap over the ember (the judge read ≈ 1.5 mm of
  frosting between the bead and the flame) to the flame reaching 0.48 mm below the ember's top. Flame 1:
  the wick enters the flame at its lowest point, ≈ 1 mm of it inside. No collar: saturated orange in the
  bright part's lowest 0–5 / 5–10 / 10–15 / 15–20 % 55/19/10/22 → 39/7/10/22 %; laptop, each flame's lowest
  20 %, mean 23 → 26 %. The march's stipple at 12× and 30× is unchanged.

### 4. The lift-off: no brushed foot, no sliver frame (`flame.ts`)

- In a gust the march takes up to twice the steps (32 → 64 with the turbulence, `uNoise.y`) from a
  white-noise start: drawn out to a thin neck in a box widened for the turbulence, the foot was a few steps
  across and the interleaved-gradient jitter's diagonals showed as brushed streaks.
- Off its fuel the soot's glow, and its absorption, are gone by cool 0.25 (≈ 8.5 ms after lift-off):
  × (1 − smoothstep(0, 0.25, cool))² over the T⁵ fall (`liftOffSeen`): half its light 4 ms after
  lift-off, 9 % at 6 ms, none from 8.5 ms. A frame 9 ms after lift-off showed the golden sliver at full
  display strength (its 20 % of radiance still saturates red: the core is ≈ 30 × over); now only the ember.
  (Fading the glow alone left the soot's absorption: a brown smudge for one frame.)
- **Measured** (10×, the back flame's R−B over its pixels against frame 0): 128 ms 74.0 → 73.9 % with a
  smooth foot; 144 ms (9 ms after its lift-off) 86.2 → 1.3 % (the ember); 160 ms 1.8 → 1.6 %.

### 5. The halo at each candle's base (optional): a hand-off

The halo peaking at each candle's own base is `FLAME_POOL` in `models/cakeShaders.ts` (the cake owner's):
its profile is `exp(−rI²)` from the candle's surface and its visibility loop skips the candle's own top
(`if (j == i) continue`). The flames' own light (`flameLightLoop`) already hides each flame from the foot of
its own candle (a disc of radius r_c (H + D) / H). The pool's placement comes from the candles' and flames'
true positions (`candleA`, `pos`), which also place its spokes: moving them would move the shadows. Hand-off
to the cake owner: take the candle's own top into the pool's visibility (the disc above), or give the halo a
ring profile peaking 2–4 cm out. Nothing changed here.

### Tells

Gone: the marshmallow (a 1 mm jet at the ember, widening into the puff), the wire (filaments 2.1–3.0 mm
half-width at 12–20 cm, widening linearly), the fold knots (none over +6), the hover (the wick inside the
flame), the brushed foot and the sliver frame. Remaining, recorded: the jet at the ember stays attached to it
while the breath decays (a continuous source: its angle swings over ≈ 150 ms; +28 levels at its densest);
the crisp-line count above the stems is traded for the widening; the flame leans as one piece (not
addressed: the judge's 0.99 correlation was not reproduced with its script on a 20× strip, 0.70 here); the
blue candles' cool-white wax tops (the light and the cake); the 192 px dots' orange bottom pixel; the
halo's peak (§5, a hand-off).

### Cost (`evidence/v1.6/flames-polish3/frame-cost.txt`)

The whole fire: lit 1.38–1.60 ms laptop (the judge's server, polish 2, in the same minutes: 1.79) / 1.19 ms
phone; the gust (0.12 s) 1.71 ms (polish 2: 1.85); the first puff 1.02 ms; the smoke at 1.5 s 0.78 / 0.76 ms
(+ 0.57–0.76 ms of physics on the main thread; polish 2's code 0.51–0.70 in the same run). Budget ≤ 2.0 ms:
met.

### Verification

`pnpm typecheck`; `tests/birthdayFire.test.ts` 37/37 (new: the burst leaves with the breath and the thread
at the wick stays the ember's millimetre; the filament's linear widening and its edge-on / face-on
stretches; rewritten: the foot under the wick's tip with its dim ramp, the lift-off's seen fraction through
`liftOffSeen`), `tests/flameRender.test.ts` 7/7, `tests/birthday.test.ts` 34/34 (continuity and C¹),
`birthdayChange` 7/7, `birthdayMeltCarry` 2/2, `scene-depth` 6/6. Browser (`BASE_URL=http://127.0.0.1:5613`,
fresh server): `birthday.spec` 7/7 (a first run on a machine at load average 20 timed out twice waiting for
the accepted pose in 4 s; real-time playback measured 1.43 s at 60 fps on both this branch and polish 2's
server, and the next two full runs passed), `bloom.spec` 3/3, `scene-depth.spec` 5/5, `posters.spec`
Birthday 1/1 (the shipped posters are not stale: at most 0.01 % of pixels over 24/255, so no recapture).
Kept qualities re-measured: the lit 1 s strip's
tip-x sd 0.95–2.12 px, dominant 1–2 Hz, area ±1.2–2.4 %, correlation −0.05; the accepted still at 8 s
identical to the judge's (no smoke), reduced motion the same.

### Evidence (`evidence/v1.6/flames-polish3/`)

`1-blow-closeup-10x-puff-back-160-304ms-judge-above-now-below.webp`,
`1-group-puff-1to1-160-256ms-judge-above-now-below.webp`, `1-4-blow-closeup-10x-0-400ms-every-16ms.webp`,
`2-smoke-2x-1.97s-judge-vs-now.webp`, `2-smoke-2x-1.07-1.58-1.97-2.48-2.99-3.50s.webp`,
`2-fold-knot-2x-1.97s-x6-judge-vs-now.webp`, `2-smoke-laptop-1to1-1.5-2.5s-judge-vs-now.webp`,
`2-accepted-540x2-4s-8s-reduced-judge-vs-now.webp`, `3-foot-macro-30x-nobloom-f1-f3-judge-vs-now.webp`,
`3-macro-30x-f1-f3-judge-vs-now.webp`, `3-laptop-flames-x4-judge-vs-now.webp`,
`4-liftoff-closeup-10x-128-160ms-judge-vs-now.webp`, `measurements.txt`, `frame-cost.txt`.

## Polish round 4: the fourth judge's fixes (v1.6 polish 4, branch `v1.6/flames-polish4`)

The fourth judge signed the flame at rest at every size, the blow at laptop, phone and 540, and the smoke's first
0.3–0.8 s, but not the whole. Three fixes remained: (1) a static jet at the wick where the capsule had been, "a soft
white cone about 1 cm long with a rounded end, glued to the ember like a spray nozzle"; (2) the smoke's widening
reading as a blur, not a sheet (0.2–1.2 crisp lines a plume, the plume nearly gone above 16 cm, six evenly bright
constant-width stems); (3) the denser first puff fogging the back-right candle to near-white. Each fix is its own
commit, measured with the judge's scripts (`jet2.py`, `sheets3.py`, `widths.py`, `puff.py`) and three of my own
(`sat.py`, `core.py`, `var.py`, in `evidence/v1.6/flames-polish4/tools/`) on frames through the real controller.
Numbers: `evidence/v1.6/flames-polish4/measurements.txt`.

### 1. The stream after extinction: a thread torn off the ember (`fire.ts` `SMOKE.stream`, `sway`, `accel`/`launch`; `ribbonShare`; `SmokeRig`)

What the cone was. The ribbons handed the breath's vapour to the volume after 2–8 mm of sideways travel, and the
burst once 4 mm up, and the volume's 5 mm voxels (σ ≥ 2.75 mm) drew it as a soft blob with a rounded end at the
ember. The stream's wander was indexed by its distance from the wick, so its shape stood still beside it while
the breath blew. The vapour also started from rest (0.12 s), so a 0.4 m/s breath still held it at 20–30°.

- **The breath's stream is a thread.** Vapour born while the breath blows (`SMOKE.stream.met`, 0.35 m/s) leaves
  the ember 0.45 mm across. It is strung out at the breath's speed (its mass per length × leave / (leave + carried
  speed)). As it is carried it is stretched: its width and its optical depth across fall as 1/√(1 + carried /
  4 mm). The ribbons draw it until the jet's eddies roll it into the puff, between 1.5 and 4.5 cm of travel
  (`SMOKE.stream.roll`). The volume draws it only from there (`ribbonShare`'s `jet`/`carried`), so nothing is
  splatted at the ember. The strands are one thread until half-way through the roll, then come apart into the
  puff's wisps. The vortex gathers the burst into one puff (`SMOKE.roll.gather`: up to 0.6 of its spread over
  its first 50 ms).
- **It moves.** The jet's wander is carried with the flow: it is indexed by the parcel's place in the breath's own
  passage (`B.xb`), not by its distance from the wick, so its waves run off downstream. The stirred air the breath
  brings sways the thread as it leaves the ember (`SMOKE.sway`: up to 0.3 rad on 3–6 Hz gusts, carried up to
  2 cm, dying over 0.4 s). The jet's own flapping now reaches the ember (its e-folding distance 2 → 1 cm).
- **It turns up as the breath drops.** Vapour torn off into a breath stronger than about 1 m/s
  (`SMOKE.stream.tear`) starts from rest as before (0.12 s). Off a wick in weaker air it leaves already rising
  (0.05 s, at 0.3 of the plume's speed: `SMOKE.accel`, `SMOKE.launch`, `plumeRise`'s `jet`).
- The wick's thread at rest is 0.55 mm (`SMOKE.width0`, was 1.0; drawn as the tube's radius it measured 1.3–1.7 mm
  FWHM at 1 mm from the ember).
- **Measured** (`jet2.py`: back wick, 10×, smoke on − off at the same frame; the breath at this wick halves at
  0.258 s):

  | | judge 4 (61940fc, re-run) | now |
  |---|---|---|
  | FWHM 1 mm from the ember, 160–400 ms | 1.5–2.0 mm | 0.5–1.0 mm |
  | FWHM at 2 / 4 / 8 mm under the breath (160–320 ms) | 2.7–3.3 / 3.4–4.0 / 6.8–13.2 mm | 0.7–0.9 / 0.6–0.9 / 0.5–0.8 mm |
  | IoU over 48 ms, 208–400 ms | 52–84 % | 0–61 % |
  | share of the jet's pixels within 3 levels over 48 ms, 208–400 ms | 26–71 % | 0–37 % (within 1 cm: 0–42 %) |
  | direction 2–4 mm out | 20–30° to 320 ms, 38–57° at 336–368 | 12–27° under the peak (flapping to 38–50° at 208–224), 42–60° at 272–320, 68–70° at 336 |

  `jet.py` is not used: its frame 0 holds the lit flame over this wick, so straight up from the ember it measures
  the flame's absence (+70–95 levels, in the judge's frames as in these).

### 2. The smoke from 1 to 4 s: sheets with fold lines; stems that neck and waver (`flame.ts` `SMOKE_SHEET`, `SmokeRig`, `fire.ts` `SMOKE.neck`)

- **A widened filament is a sheet, not a fatter tube.** Where a filament has widened, the ribbon draws it as a
  sheet: `aSheet` is the widening's share of the strip's width, face-on. A tenth of its smoke lies as a
  translucent band across the width (`SMOKE_SHEET.veil`). The rest lies in the fold lines at its edges
  (±0.82 of the half-width), each 0.4 mm across (never under 1.25 px), where the curled sheet runs along the line
  of sight. One edge or the other is the stronger as the sheet turns (`aFold`, carried up with the smoke). The
  same smoke lies across the width as in the tube (∫ tube = 1.367). Through tight turns and folds the strip is the
  plain tube (its edges would jag). Edge-on stretches are narrower (`filamentEdge` 0.2 → 0.08 of the widening).
  The filaments carry on to 30 cm over their stem's end (`SMOKE_VOLUME.filament[4]`, was 24 cm).
- **The stems neck and waver.** Each stem necks and swells by ±35 % of its width (`SMOKE.neck[0]`). The ember's
  output wavers by ±35 % of its smoke (`SMOKE.neck[1]`; the smoulder's share only, `smoulderShare`: the flame's
  last fuel does not waver). Both are carried up with the smoke at 2.5–7 Hz, a few centimetres apart along the
  stem, each candle on its own beat.
- **Measured** (2× close-up, ≈3.4 px/mm):

  | | 1.07 | 1.58 | 1.97 | 2.48 | 2.99 | 3.50 s |
  |---|---|---|---|---|---|---|
  | crisp lines a plume at 8–22 cm (`sheets3.py`), judge 4 | 0.8 | 0.5 | 0.5 | 0.7 | 0.8 | 1.0 |
  | now | 5.8 | 6.7 | 5.0 | 2.7 | 3.7 | 2.0 |
  | in each plume's own zone (1–15 cm over its stem), judge 4 | 0.8 | 0.5 | 0.2 | 0.5 | 0.5 | 1.0 |
  | now | 5.7 | 5.0 | 5.2 | 1.7 | 3.3 | 2.0 |
  | peaks at 16–20 cm (`widths.py`), judge 4 | 256 | 109 | 54 | 43 | 50 | 38 |
  | now | 309 | 351 | 255 | 161 | 221 | 220 |
  | stems' brightness along 0.5–8 cm (`var.py`, ±(p90 − p10)/2 median), judge 4 | ±7 % | ±6 % | ±6 % | ±8 % | ±6 % | ±8 % |
  | now | ±22 % | ±29 % | ±22 % | ±28 % | ±29 % | ±31 % |

  The lines' median half-width is 1.6–2.5 px (judge 4: 3.0–3.7 px), at +8–11 levels. The stems' half-width
  spread reads ±38–61 % (judge 4: ±31–35 %). At 2× a 1.5–2.5 px thread is quantized, so threads of constant width
  read ±31–35 % already. The modelled width is ±35 % by construction (tested).

### 3. The first puff over the next candle (`fire.ts` `SMOKE.breathDilute`, `models/birthdaySmoke.ts` `roomOctaves`)

The fog over the back-right candle (candle 4) is the front-centre candle's puff. It crosses that candle's line of
sight 3–5 cm from its own wick, 70–100 ms after its lift-off, and no plausible rise clears it. So the puff is made
thinner, not moved:
- The breath's jet entrains the room's air into the burst it carries: the burst is diluted to 1 / (1 + U/1.6)
  (was U/6), ×0.5–0.6 of its optical depth at the breath's 1.2–1.6 m/s.
- The dense puff scatters the room's light on (`roomOctaves` 1.1 → 4: a white cloud gives the room's light back),
  so its core stays bright.
- The fix-1 stream already keeps the volume off the first 1.5 cm, where the old puff was densest.
- **Measured** (group view at 1:1; candle 4's body, mean HSV saturation; clean 0.211, upper half 0.228):

  | | 176 | 192 | 208 | 224 | 240 | 256 | 272 | 288 ms |
  |---|---|---|---|---|---|---|---|---|
  | judge 4, whole / upper half | 0.138 / 0.121 | 0.108 / 0.061 | 0.086 / 0.036 | 0.090 / 0.054 | 0.108 / 0.076 | 0.116 / 0.074 | 0.126 / 0.075 | 0.145 / 0.107 |
  | now | 0.181 / 0.199 | 0.142 / 0.104 | 0.141 / 0.100 | 0.164 / 0.159 | 0.161 / 0.162 | 0.156 / 0.143 | 0.148 / 0.117 | 0.150 / 0.118 |

  The puff's core, as the 98th percentile of smoke on − off over each wick's puff, at 208–288 ms: +24.5–26.7,
  +24.6–33.6, +22.0–32.5, +25.7–31.7 and +25.8–30.7 levels for candles 0, 2, 3, 4 and 5. In `puff.py`'s boxes, fixed
  beside each wick, it reads +16–30 at 224–288 ms (judge 4: +25–30 at the clean wicks), because the puff now leaves
  the wick.

### Tells

Gone:
- the cone at the ember: a 0.5–1.0 mm streak, no rounded end, thinning into the puff;
- the static jet: no region within 1 cm keeps over 42 % of its pixels within 3 levels for 48 ms from 208 ms;
- the stream held low after the breath: it turns up within ≈ 80 ms of the breath halving;
- the blur above 8–10 cm: two or more fold lines a plume bounding faint veils;
- the plume gone above 16 cm;
- the six evenly bright, constant-width stems;
- the fog bank over the back-right candle.

Remaining:
- the streak at 10× is a clean line, +25–28 levels, without inner structure;
- where it rolls into the puff (2–4.5 cm out, 176–240 ms at 10×) its strands part into three to five faint wisps;
- the fold lines are drawn on the ribbon, as two edges of a band: at 4× with doubled contrast a few tight turns
  still show a kink;
- the first puff is lighter than polish 3's at laptop size (0.4–0.6 s): it is thinner by design, its core is kept
  on the puff itself, and in boxes fixed beside the wicks it reads lower as it leaves;
- candle 4's upper half touches 0.100 at 208 ms, for about two frames as the puff passes in front of it.

The optional items are untouched: flame 3's lilac crescent, the wick occluder at 30×, the blue base, the halo
(the cake's) and the rigid lean.

### Cost (`evidence/v1.6/flames-polish4/frame-cost.txt`)

The whole fire, laptop: lit 1.44–1.56 ms, the gust 1.12–1.32, the first puff 1.09–1.27 (the branch point's code in
the same minutes: 1.57), the smoke at 1.5 s 0.69–0.75 (1.01). Phone: lit 1.63, the puff 1.45–1.54, 1.5 s 1.40 ms.
Budget ≤ 2.0 ms: met (machine at load average 9–19, the split noisy). Physics on the main thread: 0.71–0.77 ms a
frame (the branch point 0.56–0.63 in the same minutes).

### Verification

- `pnpm typecheck`.
- `tests/birthdayFire.test.ts` 41/41. New: the stream is a thread at the ember, stretched thinner and the ribbons'
  until rolled; it turns up within 80 ms of the breath halving and moves within 1 cm; the stem necks and wavers
  ±30 %; the breath dilutes the burst and only the smoulder wavers. Adjusted: the filament fades out by 30 cm
  (was 24); the smoulder and snuff thresholds read the densest smoke near the wick averaged over ±0.1 s, through
  the wavering.
- `tests/flameRender.test.ts` 7/7 (new: the sheet's attributes at 1.97 s; the hand-over's first parcels counted over
  `ribbon[1]`: the vapour now leaves the ember rising).
- `tests/birthday.test.ts` 34/34, `birthdayChange` 7/7, `birthdayMeltCarry` 2/2.
- Browser (`BASE_URL=http://127.0.0.1:5614`, fresh server): `birthday.spec` 7/7. `bloom.spec` 3/3 on a clean run.
  Its "lit candles bloom" check flakes under load on a one-pixel, 1-level difference on the piping between two
  consecutive stills; it flakes the same on the branch point's code (2 of 4 runs there).
- Kept qualities, re-measured: the lit 1 s strip's tip-x sd 0.95–2.12 px, dominant 1–2 Hz, area ±1.2–2.4 %,
  correlation −0.05. The accepted still 8 s after Accept is identical to the judge's and to the branch point's (no
  smoke), and so is the reduced-motion accepted still.

### Evidence (`evidence/v1.6/flames-polish4/`)

`1-blow-closeup-10x-0-400ms-every-16ms.webp`, `1-blow-closeup-10x-144-400ms-judge-above-now-below.webp`,
`1-jet-x3-160-224-288-336ms-judge-above-now-below.webp`, `2-smoke-2x-1.97s-judge-vs-now.webp`,
`2-smoke-2x-1.07-1.58-1.97-2.48-2.99-3.50s.webp`, `2-smoke-1.97s-10-20cm-x4-contrast-judge-vs-now.webp`,
`2-3-smoke-laptop-1to1-0.4-0.6-1.5-2.5-3.5s-judge-vs-now.webp`, `3-group-puff-1to1-160-320ms-judge-above-now-below.webp`,
`3-back-right-candle-x2-176-288ms-judge-above-now-below.webp`, `accepted-540x2-4s-8s-reduced.webp`,
`measurements.txt`, `frame-cost.txt`, `tools/` (`sat.py`, `core.py`, `var.py`, `fix2.sh`, `lapcmp.py`, `grpv.mjs`,
`lab5.mjs`, `mkev.py`).
