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
