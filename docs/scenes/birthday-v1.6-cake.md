# Birthday v1.6: the cake at film quality (the Hollywood pass)

Owner, 2026-10-02 (brief: `docs/hollywood-pass-brief.md`): *"The cake still has a plasticky, too perfect and geometric
shape / texture; I'm expecting Hollywood CGI level work here."* v1.5 (`docs/scenes/birthday-v1.5-cake.md`) had tuned
the master: jittered instances, maps, a wrap. This pass rebuilds the look: the piping is regenerated as hand-piped
star-tip sweeps, the tiers are hand-coated, the light the frosting does and does not get is baked, and the frosting
gets a food shader (subsurface, translucency, coloured shade, sugar glints, colour and satin variation). The physics,
the clocks, the press, the melt, the bin and every API other scenes use are kept.

Files: `scripts/masters/recipes/birthdayPiping.ts` (new: the sculpted piping), `scripts/masters/recipes/birthdayBake.ts`
(new: occlusion and thickness bake), `scripts/masters/recipes/birthdayFinish.ts` (the hand finish: bead, waves, relief,
unique atlas, regeneration, bake, smears), `scripts/masters/recipes/birthday.ts` (the smear's cocoa variant),
`models/cakeShaders.ts` (`foodPatch`, `pearlPatch`, `FOOD`), `models/birthday.ts` (wiring, draw order, smears),
`models/birthdayContract.ts` (re-measured), tests `tests/birthday.test.ts` (updated), `tests/birthdayPiping.test.ts`
(new), tooling `scripts/cake-evidence.ts` (frames) and `scripts/cake-perf.ts` (frame cost).

## The tells (measured on v1.5 at the real sizes, `evidence/v1.6/cake/baseline/`)

Square 540 @2×, laptop 1280 × 720 @2× (≈ 2.9 device px per mm on the cake), phone 390 × 844 @3×, and macros through the
live stage's own camera and lights:

1. Swags: every strand the same smooth tube on the same curve; three parallel tubes per bay read as a moulding.
2. Rosettes: identical 16-point stars (a badge), ±10 % in size; shells identical lemons; dots perfect spheres sitting
   *on* the surface; columns and tassels clean turned parts.
3. No contact: piping rests on the body with no fillet, no crease shadow, no occlusion between strands.
4. Tiers: true cylinders, a constant 3.7–4.4 mm corner fillet that reads razor-clean; the body one flat blue; its
   0.1 mm relief invisible at laptop size.
5. Material: one GGX lobe over lambert plus a uniform wrap; no translucency at thin crests, no coloured shade, no
   sparkle; grooves and crests the same colour; nothing at the base where the cake meets the stand.

## References

Looked at side by side with the frames (not copied into the repository):

- Curly Girl Kitchen, *Lambeth Cake, Vintage Pink & Blue Birthday* (2026, photo 001) and *Chocolate Cherry Lambeth
  Cake* (2022, photo 022): star-tip ropes with 6–8 visible teeth, rounded crests and narrow soft V grooves whose depth
  wanders; shells squeezed head-first with ridged tails tucked under the next head; swirl rosettes (a rope carried
  once and a quarter round, the tail riding over the start); piping lighter on its crests and deeper, more saturated
  in its grooves and shade, never grey; a satin, faintly grainy body; contact shadows in every crease.
- Before & Afters, *Retro RenderMan: shading food for Ratatouille*: irradiance scattered uniformly (not per
  channel: no waxiness), a "diffuse softening" short scatter that keeps surface detail, and scatter blended in where
  the diffuse is dark but not where it is bright.
- Penner & Borshukov, *Pre-Integrated Skin Shading* (SIGGRAPH 2011) and MJP, *An Introduction to Real-Time Subsurface
  Scattering*: curvature-driven diffusion of the N·L falloff; blurred normals for the diffuse.
- Barré-Brisebois & Bouchard, *Approximating Translucency for a Fast, Cheap and Convincing Subsurface Scattering
  Look* (GDC 2011): thickness-driven back light with distortion, power and scale.
- Deliot & Belcour, *Real-Time Rendering of Glinty Appearances using Distributed Binomial Laws on Anisotropic Grids*
  (HPG 2023): sparse facets on a grid, faded where the pixel covers many.

## Decisions

### Geometry: regenerated, not sculpted

The master's piping cannot be sculpted into hand-piped rope: its swags are 9-point half-pipes, its rosettes stars.
Every piped part is regenerated procedurally (`regeneratePiping`) *at the master's own placements, sizes and counts*
(the design stands: 26 side rosettes, 12 crown rosettes, 78 swag strands, 13 columns, 26 tassels, 59 shells, 39
dots, 2 rope borders, 118 dragées), each from its own seed (`seedOf(node) + k`), deterministic.

The rope (`sweep`): a star tip's cross-section, an ellipse of the rope's half-width and height pressed ≈ 1 mm into what
it is piped on, with teeth `((1 − cos 2πf)/2)^k` (rounded crests, soft V grooves; continuous at every groove whatever
a tooth's depth), each tooth's depth jittered ±15–20 % and drifting ±42 % along the rope, the tip turning as the bag
turns (`tw`), the teeth fading into a concave fillet where the rope meets the surface (flare 22–30 % of its height).
Along it (`pressure`, `taper`): ±7–12 % swells over ≈ 2 cm, a 12–35 % fatter start, a hiccup in a third of the ropes
(a 16 % thinning and the lump after it), a rounded start cap, the pulled tail thinning to 12–25 % and drawn into the
surface, and the very end closed. Per part:

- swag strands: the master's strand paths (their feet put on the tier's real profile), 11–13 teeth, a 0.6–1.4 mm sag
  at the low point, a ±1.4 mm curl at the tail, a 0.18 mm hand wander, either end the start;
- columns (pulled lines, 16 teeth), tassel bulbs (onion pressure, 14) and fans (flared, 18);
- shells: squeezed (a rounded head at 26–34 %) and pulled into a ridged tail, 9–10 teeth, each 1.42 slot long so its
  tail runs under the next head; the bottom border beds into the plate to the master's underside;
- rosettes: a rope (12–14 teeth, 42–47 % deep) carried 1.13–1.37 turns out from a fat start, the tail riding over
  the first loop and tucked down; side rosettes face out 6–12° above level, settle onto the tier's edge where they
  are within ≈ 3 mm of it (`restOn`, smoothed along the rope) and droop ≈ 0.9 mm where they overhang, with a soft
  mound behind (`backMound`) so the far side reads as buttercream, not a coil's flat underside; crown rosettes sit on
  the top's edge, tipped out 1–6°;
- rope borders: a 6-tooth tip turned a full turn every 8.5–10 mm (diagonal twists; the section samples turn with the
  tip so the grooves stay clean), a push's bead every ≈ 3.4 mm, piped in four overlapping runs;
- dots: round-tip domes pressed in with a fillet and the peak the bag left, drooping;
- dragées: spheres ±6 % in size and ±3.5 % out of round where the master set them.

Totals: 1,601,496 triangles (v1.5 812,816); piping ≈ 620 k vertices.

### Hand-coated tiers

- the top edge: the master's 3.7–4.4 mm fillet replaced by a 6.0 mm (bottom) / 6.5 mm (top) bead tangent to side and
  top (`handProfile`, `EDGE_BEAD`; ×1.1 at CAKE_SCALE), with a hand-pushed lip just inside it (0.45–0.5 ± 0.4 mm
  round the tier) and a shallow 0.25–0.3 mm valley where the spatula lifted (`topUneven`, `EDGE_LIP`);
- the scraper's hand waves (`HAND_WAVES`, m = 5–18 round the tier, drifting with height) on top of v1.5's low-frequency
  drift: the silhouette now −2.4 … +2.0 mm (bottom tier) and ±1.7 mm (top) about round, the top tier 2.5 mm off centre;
- relief (periodic atlas): knife chatter in patches (near-vertical ripples 2.9 mm apart, ≈ 25–30 µm), and on the tops
  the turntable's Archimedean spiral (7.5 mm pitch, ≤ 70 µm) under the palette-knife strokes;
- the base: three thin smears of the coat dragged out from under the bottom border (0.14–0.3 mm, 7–12 mm long,
  streaked along the drag) and three crumbs, on the plate (`cake_smears`, a child of the stand so they stay on it when
  the cake is carried off; one in view front right, one at the left edge, one behind). Their own material
  (`cake_smear`, `cake_smear_cocoa`).

### Baked light (`birthdayBake.ts`, in the export)

The finished frosting and the plate's top are voxelised at 0.55 mm; for every piping vertex and every texel of the
body's unique atlas, 24 cosine-weighted rays give the room's occlusion (10 mm reach) and contact (2.5 mm), and a march
inward gives the thickness light crosses (0.6–15 mm). Piping, rosettes, smears: one RGBA8 vertex attribute `_FOOD`
(x the tooth ridge, y occlusion, z thickness / 16 mm). The body: a 1024² contact map on a new unique UV set
(TEXCOORD_1: each tier's side as a 1024 × 128 band by angle, each top a 512² square; ≈ 0.75 mm a texel on the bottom
tier's side), R three's aoMap, G contact; texels under the piping refilled from the frosting beside them, lightly
blurred. 4.6–5.6 s of the ≈ 30 s export.

### The food shader (`models/cakeShaders.ts` `foodPatch`, `FOOD`)

Per fragment, on the body, piping and rosettes (both presets), in the existing patch chain (`patchMaterial` →
`patchFlameLight` → `patchBinVisibility`, press and plate contact kept):

- **subsurface**: the direct diffuse falls off with a wrap whose width grows with thinness (piping: its baked thickness
  and tooth crests; body: screen-space curvature, so the bead scatters more than the side): `w = wrap + wrapThin ·
  thin` (body 0.32 + 0.7, piping 0.38 + 0.85, cocoa 0.20/0.24 + 0.45/0.55); the light past the terminator added only
  where lambert is dark (`scatter` 0.75–0.8, cocoa 0.6–0.65), tinted by the frosting's own colour saturated ×1.3–1.5
  with a little of the fat's warmth (white piping: butter); half the lambert seen through a softened normal;
- **translucency** (the key light): `exp(−thickness / 2.6 mm)` (cocoa 1.4–1.5 mm), distortion 0.3–0.35, power 3–4,
  strength 0.5 (body) / 0.75 (piping);
- **coloured shade**: the room's light saturated ×1.15–1.2 (multiple scattering) and thin parts lit a little through;
  occlusion coloured (a crease is the frosting's colour, darker, never black: floor 0.36 on the piping);
- **occlusion**: the baked occlusion on the room's light (diffuse and specular) and at 40 % (piping) – 45 % (body)
  on the key (micro-shadowing the 1024 shadow map cannot resolve);
- **sugar glints** (vanilla only; the key, not the flames): crystals in 0.16 mm and 0.53 mm cells (55 % and 19 % of
  cells), each facet anywhere within ≈ 55° of the surface, a 380 lobe, faded where a cell is smaller than a pixel;
- **colour**: a hand-mixed mottle (±2–3 % at 2–4 cm), crests lighter and warmer, grooves and creases deeper and more
  saturated (piping up to ≈ 6 %, cocoa ≈ 10 %); the body deeper where the contact map says piping is near;
- **satin roughness**: piping 0.34 (crests) → 0.62 (grooves) + 0.1 in creases, with the very slight sheen on the crests;
  body the v1.5 map 0.40–0.66 + 0.12 in contact creases (the candles' gloss as before); cocoa: ganache 0.26–0.50
  (piping) and 0.30–0.50 (body), no glints;
- **sugar grain** (≈ 0.5 mm bump, faded out where a pixel covers it) on every frosting part.

The tiers draw first (`renderOrder −1`), so the piping's buried feet are depth-rejected before they are shaded.

### Contract and the scene's geometry hooks

Re-measured from the export: `MASTER.cakeRadius` 0.62869 scan (13.83 cm; v1.5 0.635837), `MASTER.cakeTop` 0.64371
(v1.5 0.647391); the underside stays the master's (the bottom border is flattened onto it), so `STAND_TOP`,
`CANDLE.seat`/`insert`, the press's `TOP_Y` and the plate contact are unchanged. Sockets: unchanged (the top within
±1 mm of the master's at every socket, tested). Bin clearance: `CAKE_RADIUS` is smaller (more clearance); every bin
test passes. Placement collar, dimple and melt: unchanged and working (strip below).

### Frame cost

`scripts/cake-perf.ts`, M2 Pro, Chrome 154 headless (Metal), real time, guest-ready with live flames then two accept and
two decline cycles, A/B against v1.5 (`7ebc274`) on its own server, interleaved:

- frame interval: laptop and phone both p50 16.7 / p95 16.7–16.8 / p99 16.8 ms (60 fps);
- the frame rendered back to back with a pixel read-back (wall time, the GPU waited on): v1.6 laptop 2.9–3.5 ms
  (median 3.08) vs v1.5 2.6–3.9 (3.09); phone 2.1–2.3 (2.2) vs 2.0–2.6 (2.5): no measurable difference;
- the patches alone (the same frame with the frosting's patched materials vs plain clones of them): +0.0 ± 0.2 ms at
  both sizes (≤ +1.5 ms: headroom for the flames' bloom);
- GPU timer queries around the stage's render were too noisy on this shared machine to separate builds (v1.5 alone
  4.5–6.4 ms medians run to run); recorded in `evidence/v1.6/cake/perf.txt`.

Cost elsewhere: GLB 31.9 MB raw / 15.2 MB gzip (v1.5 12.5 / 6.9; budgets waived): mostly 32-bit indices of the joined
piping. Meshopt compression in the shared export chain (`compose.ts`, with the decoder in the scene's loader) would
take most of it back; that is outside the cake's files and left to the integrator.

## Adversarial passes (frames beside the photographs: "would a VFX supervisor sign this as buttercream?")

1. First sweeps: teeth too fine and regular, crushed-ice shells (a random tooth phase per foot), dots with a sawtooth
   rim (a closing fan that confused orientation), black creases (occlusion to zero). Fixed: random draws hoisted
   per piece, smooth tooth profile, open dot foot, coloured occlusion with a floor.
2. Swags read grey and busy at laptop size; rope border crumbly and jagged; shells separate "teeth". Fixed: lighter
   groove darkening, twisted rope with twist-aligned sampling, overlapping shells.
3. Rosettes: shallow flutes (plasticine), a fin of tail, flat discs seen from behind over the far edge, lower half
   floating off the side. Fixed: 12–14 deep teeth, tail tucked, back mound, settle-onto-surface (side rosettes only:
   on the crown rosettes it crumpled them).
4. Body: corduroy chatter, a blocky dark outline round the shells (under-piping texels bleeding), no sparkle. Fixed:
   patchier, shallower chatter; gutter refill and blur; glints with wide facet distribution.

Remaining, judged at the real sizes and in close-up: the far side's rosette backs are smooth mounds (correct for
buttercream, but plainer than the fronts); crown rosettes read as tidy stacked swirls; the smear is small enough to be
missed. The single frontal key of the production rig (`neutral-room`, kept: no compensating grade) still gives the
product-shot evenness the brief mentions; the material now carries the depth.

## Evidence (`evidence/v1.6/cake/`)

- `baseline/`: v1.5 at the three sizes and in macro;
- `final/`: the same views on v1.6, vanilla and cocoa (`*-square540`, `*-laptop(-crop)`, `*-phone(-crop)`,
  `*-macro-*`: hero, side, swag, rosette, top edge, top surface, base, graze, and single pieces `z-*`), the host
  placement strip (`placement-strip`), and side-by-side sheets `compare-*.webp`;
- `perf.txt`: the frame-cost runs.

Regenerate: `pnpm models birthday`, `pnpm dev --host 127.0.0.1 --port 5601`, then
`node --experimental-transform-types --no-warnings scripts/cake-evidence.ts final http://127.0.0.1:5601 sizes,macros,cocoa,strip`
and `node --experimental-transform-types --no-warnings scripts/cake-perf.ts http://127.0.0.1:5601 v16`.

## Tests

`tests/birthdayPiping.test.ts` (new, 8): determinism to the bit; no two pieces alike; teeth that read (≥ 3 crests,
≥ 0.4 mm deep); ropes pressed in with a fillet; ends that close and tails that thin; pressure; the pulled dot; the
bake's occlusion and thickness. `tests/birthday.test.ts`: the stand test measures the stand's own mesh and checks the
smears on its plate; the material test checks the packed `_FOOD` attribute and the unique contact map; the hand-coat
test allows the scraper's waves (neighbouring 5° bins ≤ 1.2 %); a new test checks the edge bead (≥ 2.2 mm from a cut
cylinder's corner, v1.5 1.7).

Posters (`tests/browser/posters.spec.ts`) fail until the integrator regenerates the Birthday posters, thumbnails and
backdrops: the cake changed.

## Polish round (2026-10-03: the VFX judge's five fixes)

A VFX judge scored the build above 5.5–6.5 at the showcase sizes and 3.5–4.5 in macro and asked for five fixes. Frames
through the live stage from the judge's own cameras (`judge.mjs`: laptop crop, square 540, phone crop and the macros
hero-close, swag-z, rosette-z, rosette-side3q, shells-z, top-edge, body-upper-z, base, far-edge, crown-row, crown-z,
smear-z, sockets-front, plus rosette-edge for the silhouette): `evidence/v1.6/cake-polish/` (`before/` is fix 1's
state, `final/`, side-by-side `compare-*.webp`, cocoa in `final/cocoa-*`, `perf.txt`).

1. **The coat** (`67cfd13`): satin range 0.30–0.44 (cocoa 0.15–0.26, piping 0.20–0.38) with a slow ±0.07 drift,
   scraper streaks round the side and wandering turntable streaks on the top (±3–5 %), hand-mixed hue drift, a lighter
   top, unique hand relief in the shader (±0.35 mm, 2× on the top), clustered pinholes, glints within ≈ 22° of the
   grain normal; the atlas without its crater rings and corduroy chatter.
2. **No twins** (`birthdayPiping.ts`, `birthdayFinish.ts` regeneratePiping):
   - rosettes ±15 % in size (was ±5 %), tipped ±8° about a random axis, the start anywhere round; the pearl set
     0.06–0.22 R off the centre, one rosette in eight without one (30 of 38 keep theirs);
   - the side rosettes' rope, where it overhangs the edge, carries the star's teeth all round (`Foot.back`,
     `Tip.wrap`), and their backs (`backMound`) are the coil seen from behind: 4–4.8 loops of rope (≈ 0.16 R deep)
     with finer teeth on them, 0.74 R across (was a smooth 0.9 R dome);
   - crown rosettes are domed swirls (`domedSwirl`): 1.35–1.75 turns from the outside in, each loop riding up on the
     last (the dome 1.7–2.1 × the rope's height), the rope thinning 40 % as the pressure eases, its section square to
     the climb, pulled off in a tapered peak that leans the way the bag left, a star kiss closing the eye;
   - dots ±20 % in size, the peak leaning anywhere (±160° from down, 0.3–0.75 of its pull), finer (16 × 40);
   - swag bays hang ±2.6 mm at the low point (each bay together, ±0.5 mm a strand), strands ±12 % thick, 10–20 % fuller
     where the loop bottoms out.
3. **Shells and pearls**:
   - shells are one chain: 1.6 slots long (was 1.42), the head at 35 %, the back rising out of the last tail (from 25 %
     of the head), the tail fuller (exponent 1.3) running on under the next head and 25 % lower; 9–10 teeth, crest 0.5,
     amp 0.30 (crisper, converging on the tail); the bottom border slumped onto the plate (`Foot.bulge` 0.3, the upper
     border 0.15); the plate's crease (`plateContactPatch`): a ≈ 1 mm dark line on the key and the room's light, darkest
     in the gaps between heads;
   - every pearl is bedded once all the piping is built (`PipingHash.bed`): lifted out, up and away from the piping
     round it (or along its rosette's axis), until the piping holds only its lowest 30 %; a shell border's dragée now
     sits on the chain where a head meets the last tail; rosette pearls on the eye's kiss, crown pearls pressed into the
     dome beside the peak;
   - the dragée is a sugar shell (`pearlPatch`, `patchFrosting`): roughness 0.34, clearcoat 0.5 at 0.16 (was 1 at 0.04:
     the chrome), iridescence ≤ 0.3, a little sheen, each pearl's own tint (ivory to a breath of blue, ±2 %) and dents
     (≈ 1 mm); its occlusion floored at 60 % and coloured by the frosting it sits in.
4. **Macro geometry**:
   - rosette centres: the path never turns tighter than 1.12 × the rope's half-width (the folds were the crumpled
     centres), the start blob 18 % fat (was 35 %, taller than the tail riding over it), the tail lies on its own first
     loop (lifted by 90 % of the loop's height) on the outside, never back across the centre, and the eye is a star
     kiss (8 teeth);
   - swag ends tucked 0.8 h into the coat over their first and last 7 % (no white end between a rosette's loops);
   - silhouettes: swag strands 4.6 samples a tooth (was 4) at 1.6 mm along (was 1.4), crest 0.42 and amp 0.23 (deeper,
     narrower grooves); the rope border's teeth rounder (crest 0.55, amp 0.19, 6 samples a tooth) and its beads softer
     (12 %, was 20 %): no row of spikes three-quarter on;
   - grooves and creases shaded towards the frosting's own scattered colour squared (`FoodLook.grooveTint`: piping
     0.32, body 0.3), never a cool grey;
   - the coat's contact: the room's 10 mm occlusion at half strength (`aoMapIntensity` 0.5) and the key's occlusion only
     on the 1–2 mm contact (`smoothstep(0.15, 0.95, contact)`): no centimetre halo, no quilting;
   - the smear a film (13–20 mm, ≤ 0.3 mm, feathered to nothing, streaked and fingered along the drag, its edge
     see-through over the plate: the material is drawn transparent from the film's thickness, carried in the ridge
     channel), 3 mm further out (it lay under the slumped shells); crumbs lumpy and pitted (`crumb`);
   - tassels and columns: tooth depth ±28–30 % drifting along, the skirts 0.35 → 1 → 0.7 with a 10 % tail, and a pulled
     hem (`pulledLine` `hem`): each pleat drawn down its own way (crests further than grooves, smooth round the hem);
   - the bake's per-vertex occlusion (2 passes) and thickness (5 passes, in log) averaged over each piece's one-ring:
     the inward march found a small dome's far side from one vertex and missed it from the next, and the translucency
     switched on and off in grey facets (the dots, the rosettes' eyes).
5. **Light and colour**:
   - white piping ivory (`ivoryK`, by how unsaturated the material is: the blue rosettes keep their hue): albedo
     × (1, 0.985, 0.95) and its shade × (1.02, 1, 0.95); a lit swag crest at hero-close 232, 227, 217 (was 220, 223, 231),
     a shell crest 246, 243, 235;
   - a thin-edge glow (`FoodLook.rim`: piping 0.55, body 0.25): thin parts seen edge-on against a light, on the key and
     the flames; the flames now also shine through thin piping in front of them (`flameTrans` 0.9, the key's `trans`
     0.75);
   - the warm pool on the top coat (`FLAME_POOL`, gain 2.0, wrap 0.5) in the body's own patch: each flame's light on
     the top tier's top through every candle as a soft upright occluder (its own: the dark disc at its foot; the other
     five: soft spokes), reading the flames' shared uniforms by reference (models/birthdayFire.ts untouched; the flame
     lights are created before the frosting is patched); plus a broader scattered lift of the flames' own light
     (`flameGain` body 0.5, piping 1.2). The top coat at sockets-front 169, 192, 244 → 188, 199, 244.
   - **Rig, noted (not changed):** the shared `neutral-room` key is frontal for the decorated face; the material carries
     the relief and the pool now carries the top, but a key 30–40° to the side (or a rim) would give the piping the
     raking light the photographs have. That is the rig's owner's call.

Geometry and contract after the round: 1,786,792 triangles (fix 1: 1,601,496; the side rosettes' all-round teeth and
coil backs, the shell chain's 44 rows and the swirls are most of it); `MASTER.cakeRadius` 0.63567 (the rosettes and the
slumped border reach the bin limit, now 0.6 mm short of it so the cake stays 27.7 cm ± 1 %), `MASTER.cakeTop` 0.65176
(the swirls' peaks and pearls); sockets, collar, dimple, melt and the bin clearance unchanged (tests). Frame cost
(`perf.txt`): the frosting's patches +0.01 ms at both sizes, 60 fps (p99 16.8 ms).

What the judge would still find, and why:

- side rosettes seen edge-on at the silhouette (rosette-edge, the laptop's left edge) are stacked ridged loops, closer to
  a real coil but busier than a photograph's; their far-side backs read as ridged mounds, not every loop;
- where a rosette's tail rides over its start there is a short step in the rope (two toothed ropes intersecting);
- the pool is a warm cast over the whole top more than distinct pools: six flames 5 cm up overlap (physically right);
  the other candles' shadows are faint at the showcase sizes;
- the smear is still small in the judge's smear-z frame (a shell's slumped foot covers its start);
- the frontal key (above).

Tests: `tests/birthdayPiping.test.ts` (8; the dot test now asks for peaks leaning their own ways, ≥ 3 quadrants over 12
seeds), `tests/birthday.test.ts` 34, `tests/masters.test.ts` 5, `tests/world-scale.test.ts` 7, `tests/bin.test.ts` 18,
`tests/browser/birthday.spec.ts` 7, `pnpm typecheck` clean. Posters still need the integrator's regeneration.

## Polish round 2 (2026-10-03: the re-judge's four fixes)

The VFX re-judge scored the polished cake vanilla 7 / cocoa 7.5 at square 540, 6.5 / 7 at laptop and phone, 4.5 / 5 in
macro, signed cocoa at 540 and phone only, and named the four fixes that would get its signature at all three sizes.
Frames through the live stage from the re-judge's own `judge.mjs` (laptop crop, square 540, phone crop; the macros; the
`NOPOOL=1` probe that zeroes the flames' intensities): `evidence/v1.6/cake-polish2/` (`final/`, `noflame/`, side-by-side
`compare-*.webp` against the re-judge's frames, `compare-flame-lift-top-surface.webp` the flames' red lift ×6,
`measurements.txt`, `perf.txt`).

1. **Side rosettes: one rope round** (`spiralRosette`, `backMound`, `restOn`). The "terraced stacks of ridged sheets
   with jagged rims" were three things, not the star:
   - `restOn` returned 0 ("on the surface") where it found no surface within 2 cm, so every foot over the top was
     settled as resting and flared its fillet into the air (the free sheet edges); it returns Infinity (far) now, and
     the fillet only flares where the foot still touches (0.3–1.2 mm off, was 1–3 mm);
   - the settle (a foot up to ≈ 3 mm off the side moved onto it) was eased over ±5 samples (±25° of the coil): a few
     millimetres within a quarter of the rope's width sheared the tight coil through itself at the top edge (the
     terraces); it is eased over ±60° (L/6);
   - the overhang's all-round teeth (`Foot.back`) and full-section sampling (`Tip.wrap`) are gone (the rope's underside
     is its round section), and the back mound is a smooth mass inside the coil's outline (0.64 R, 0.36 R behind; its
     4–4.8 ridged loops at 3 % of their depth).
   The star is broader and runs along the rope: 10–11 teeth (was 12–14), crest 0.45, depth 0.44 ± 0.05, the tip turned
   0.45 rad over the rope (was 1.1) and the teeth's depth drifting less (1.4, jitter 0.12): edge-on the coil shows
   parallel rope ridges, not converging folds (`ROSETTE_TIP`).
2. **The tail merged into its first loop**:
   - the tail is where the pressure eases off from a little before the rope comes round (max(20 %, 1 − 1/turns + 5 %)),
     thinning to a fifth, its teeth fading (−85 % by the end, −80 % from where it climbs);
   - it sits on the start's crown where it actually crosses it (`crownAt` of the rope one turn earlier, at the tail's
     offset), the climb eased along ±9 samples, the section square to the 3D rope (the old up along the axis and a 45°
     ramp sheared the section into the flap and the polygon shards);
   - the start under the tail is pressed down 40 % and spread ×1.4, its teeth flattened (−90 %): two toothed ropes
     crossing at a small angle had met in a ragged seam;
   - 1.25 ± 0.06 turns (was ± 0.12: a tail riding over a third of the coil read as a fold), the tail easing 2.5–7.5 % in
     (was 5–13 % out), the start out to the ring over 18 % of the rope (was 26 %);
   - the star kiss flush in the eye: 0.22 R up (was 0.15), 0.46 R across (was 0.42): its top 0.90–1.13 of the coil's
     crest over 12 seeds (`tests/birthdayPiping.test.ts`), no crater ring.
3. **The flames' light pools, and the candles throw the key's shadows** (`models/cakeShaders.ts`; the flame files
   untouched, their uniforms read by reference). The +27 R over the whole top was the gain-2 pool on the full inverse
   square plus the flames' broad light at full strength:
   - `FLAME_POOL`: each candle's own halo, I/(d² + a²) × wrap × exp(−(r / 2 cm)²) with r from the candle's surface, gain 7,
     through the other candles' spokes; on the top coat the flames' broad light (the loop's RE_Direct: three's lambert
     and the food terms, scaled inside RE_Direct) answered at 0.4;
   - `KEY_CANDLE_SHADOW`: each candle's soft shadow from the key's direction (captured in the key's own RE_Direct) on
     the top coat, analytic (the rig's 1024² map has ≈ 3.3 mm texels and a 5-texel filter: the 8 mm candles vanished in
     it; the rig is not this pass's): the key's diffuse takes 0.85 of it and, because the key is only ≈ 7 % of the top's
     light (zeroing it moved the top 164 → 151 R), the room light's window share 0.32, 1.5× softer; the penumbra opens
     0.2 per unit along the shadow.
   Measured (`measurements.txt`): the top's centre 157–160 R with the flames off, 162–165 with them (+5 R; was 158 →
   184–187), hue 220.4–220.9° (the side 220.5°; was 227°); the red lift round a candle +24–29 at 0.5–1 cm, +16–18 at
   2 cm, +10 at 3 cm, +5–7 at 4–5 cm (was a flat +19–20); the shadow streak at laptop 172 against 189 beside it
   (the same patch 187 with the shadows off).
4. **The top's texture** (`cakeTopArcs`, `TOP_ARCS`). The water-ripple rings were the coat's colour streaks banded in r
   (noise in r × 45 and × 110), not the relief: the top's marks are now the spatula's passes on a turntable, two spirals
   (10 and 17 mm pitch) wandering ±0.35 pitch, cut into passes of uneven length with 58 % left smooth, each a narrow
   ridge with the cream it pushed aside, rising out of a ridge where the blade landed and ending in a lip where it was
   lifted (relief, colour), and isotropic hand-mixed colour between them. Laptop top patch (`sigp.py`, 176,72 40×40)
   σ 3.16 with the candle shadows switched off in a measuring build (was 2.28), 7.58 as shipped (a candle's shadow
   crosses the patch); cocoa 3.21 → 4.37 / 5.58. The pinholes smaller and fainter (0.15–0.5 mm, −16 %).
5. **Pearls** (the optional item): a third of the shell-junction dragées left off (bottom 28 → 19, top 18 → 13), the
   rest ±10 % in size and up to a tenth of their radius off the junction; every pearl moves rigidly with the finish
   field (`deformRigid`: the bays' drop changed over a pearl's height at the column tops and stretched it into an
   egg); overlapping pearls would leave the smaller off (none do).

Geometry and contract after round 2: 1,743,646 triangles (was 1,786,792); the frosting reaches r 0.63547 (the contract's
`MASTER.cakeRadius` 0.63567 kept as the bound), `MASTER.cakeTop` 0.65176 unchanged; sockets, collar, dimple, melt and
the bin clearance unchanged (tests). Frame cost (`perf.txt`): the frosting's patches +0.03 ms (laptop), +0.02 ms (phone),
60 fps (p99 16.8 ms).

What the judge would still find, and why:

- the rosettes at the silhouette are coils with parallel rope ridges; the one seen a little from behind shows its
  pearl's side folded by the droop, and the top tier's coils seen from above show their start inside;
- on a few rosettes the start's pressed outer flank shows beside the tail, smooth where the tail flattened it;
- the halos read a touch pink on the blue at square 540; the flames owner's intensity scales them (the centre stays
  within +10 R up to about twice today's intensity);
- the candles' key shadows are analytic upright capsules (no flutes, no shadow from the flame) and soft smudges at macro;
- where the two spirals cross, the top's passes read a little like contour lines at macro;
- the macro-only list (crisper star ridges, sugar grain, a window reflection on cocoa, tassel beads, the smudge on
  body-upper-z) was not in this round.

Tests: `tests/birthdayPiping.test.ts` 9 (new: the side rosette's kiss flush in the eye, the coil inside its radius),
`tests/birthday.test.ts` 34, `tests/masters.test.ts` 7, `tests/world-scale.test.ts` 7, `tests/bin.test.ts` 18,
`tests/browser/birthday.spec.ts` 7, `pnpm typecheck` clean.
